import { kv, kvex, pgClient, safeSql, waiting } from "postgres-kv";
import { MQ_HAS_JOB, MQ_STATE_TABLE, REMOVE_ON_COMPLETE, REMOVE_ON_FAIL } from "./keys";

export type State = "wait" | "active" | "completed" | "failed";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Job = { id: number; data: any; response?: any; failedCount?: number };

function getTableName(table: string) {
  return "mq_" + safeSql(table);
}

const cacheTable: Record<string, number> = {};
async function createTable(table: string): Promise<void> {
  if (cacheTable[table] === 2) {
    return;
  }
  if (cacheTable[table] === 1) {
    await waiting(200);
    return createTable(table);
  }
  cacheTable[table] = 1;
  await pgClient().query(`
  create table if not exists "${table}" (
    id integer primary key generated always as identity,
    state varchar(36) NOT NULL,
    fail int NOT NULL,
    v varchar(81920),
    ex bigint NOT NULL,
    updateAt timestamptz NOT NULL DEFAULT now()
  );
  create index if not exists ${table}_updateAt on kvex using BTREE(ex);
  create index if not exists ${table}_state on kvex using BTREE(ex);
  create index if not exists ${table}_ex on kvex using BTREE(ex);
  `);
  cacheTable[table] = 2;
}

// create table and set key,value
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function insert(table: string, state: State, v: any, sizeLimit?: number): Promise<number> {
  table = getTableName(table);
  await createTable(table);
  const data = JSON.stringify({ v });
  if (sizeLimit && data.length > sizeLimit) {
    throw new Error(`"Queue data failed:, ${table}, the data size is larger than the sizeLimit`);
  }
  const res = await pgClient().query(`insert into ${table} (state, fail, v, ex) values ($1, 0, $2, $3) returning id`, [
    state,
    data,
    Date.now(),
  ]);
  if (res.rowCount === 0) {
    throw new Error(`"set failed:, ${table}, ${state}, ${v}`);
  }

  const id = res.rows[0];
  return id;
}

async function updateState(table: string, id: number, state: State): Promise<void> {
  table = getTableName(table);
  await createTable(table);

  const res = await pgClient().query(`update ${table} set state=$2 where id = $1`, [id, state]);
  if (res.rowCount === 0) {
    throw new Error(`"set failed:, ${table}, ${state}`);
  }
}

async function updateFailNumber(table: string, id: number, maxFailed: number): Promise<number> {
  table = getTableName(table);
  await createTable(table);
  const resFail = await pgClient().query(`select fail from ${table} where id = $1 limit 1`, [id]);
  const fail = resFail.rows[0].fail;
  if (fail >= maxFailed) {
    await updateState(table, id, "failed");
    return fail;
  }

  const res = await pgClient().query(`update ${table} set fail=$2 where id = $1 limit 1`, [id, fail + 1]);
  if (res.rowCount === 0) {
    throw new Error(`"set fail number failed:, ${table}, ${id} ${fail}`);
  }
  return fail;
}

// create table and get key,value
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function get(table: string, state: State): Promise<Job | null> {
  table = getTableName(table);
  await createTable(table);

  const res = await pgClient().query(`select id, v from ${table} where state = $1 limit 1`, [state]);
  if (res.rowCount === 0) {
    return null;
  }
  const item = res.rows[0];
  return { id: item.id, data: JSON.parse(item.v).v };
}

async function checkState(id: number, table: string): Promise<State | null> {
  table = getTableName(table);
  await createTable(table);

  const res = await pgClient().query(`select v from ${table} where id = $1 returning state`, [id]);
  if (res.rowCount === 0) {
    return null;
  }
  return res.rows[0];
}

// create table and del key
async function del(table: string, id: number): Promise<void> {
  table = getTableName(table);
  await createTable(table);

  const res = await pgClient().query(`delete from ${table} where id = $1`, [id]);
  if (res.rowCount === 0) {
    throw new Error(`"delete failed:, ${table}, ${id}`);
  }
}

// create table and del key
async function delByState(table: string, state: State): Promise<void> {
  await waiting(kvex.config.clearInterval + 5000);
  const hasJob = await kv.get<boolean>(MQ_STATE_TABLE, MQ_HAS_JOB);
  if (hasJob) {
    return;
  }

  table = getTableName(table);
  const hasDelay = await kvex.get(table, (state === "completed" ? REMOVE_ON_COMPLETE : REMOVE_ON_FAIL) + table);

  if (hasDelay) {
    return;
  }
  table = safeSql(table);
  await createTable(table);
  await pgClient().query(`delete from ${table} where state = $1`, [state]);
}

export const mqEvents = {
  insert,
  get,
  del,
  checkState,
  updateState,
  delByState,
  updateFailNumber,
};
