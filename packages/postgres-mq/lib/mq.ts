import { kv, kvex, pgClient, safeSql, waiting } from "postgres-kv";
import { MQ_HAS_JOB, MQ_STATE_TABLE, REMOVE_ON_COMPLETE, REMOVE_ON_FAIL } from "./keys";

export type State = "wait" | "active" | "completed" | "failed";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Job = { id: number; data: any; response?: any; failedCount?: number };

function getTableName(table: string) {
  if (/^mq_/.test(table)) {
    return safeSql(table);
  }
  return "mq_" + safeSql(table);
}

const unloggeds: Record<string, boolean> = {};
function setUnlogged(table: string) {
  table = getTableName(table);
  unloggeds[table] = true;
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
  create ${unloggeds[table] ? "UNLOGGED" : ""} table if not exists "${table}" (
    id integer primary key generated always as identity,
    state varchar(36) NOT NULL,
    fail int NOT NULL,
    v varchar(819200),
    read bigint NOT NULL
  );
  create index if not exists idx_state on ${table} using BTREE(state);
  create index if not exists idx_read on ${table} using BTREE(read);
  `);
  cacheTable[table] = 2;
}

// create table and set key,value
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface DataItem {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  sizeLimit: number;
  delay: number;
}
async function insert(table: string, state: State, datas: DataItem[]): Promise<number> {
  table = getTableName(table);
  await createTable(table);
  let n = 0;
  const sql: string[] = [];
  const values: unknown[] = [];
  datas.forEach(({ data, sizeLimit, delay }) => {
    sql.push(`($${n + 1}, 0, $${n + 2}, $${n + 3})`);
    n += 3;
    values.push(state);
    const v = JSON.stringify({ v: data });
    if (sizeLimit && v.length > sizeLimit) {
      throw new Error(`"Queue data failed:, ${table}, the data size is larger than the sizeLimit`);
    }
    values.push(v);
    values.push(Date.now() + delay);
  });
  const text = sql.join(",");
  const res = await pgClient().query(`insert into ${table} (state, fail, v, read) values ${text} returning id`, values);
  if (res.rowCount === 0) {
    throw new Error(`"set failed:, ${table}, ${state}`);
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

async function updateFailNumber(table: string, id: number, maxFailed: number, removeOnFail: boolean): Promise<number> {
  table = getTableName(table);
  await createTable(table);
  const resFail = await pgClient().query(`select fail from ${table} where id = $1 and state='active'`, [id]);
  if (resFail.rowCount === 0) {
    throw new Error("update fail no find job");
  }
  const fail = resFail.rows[0].fail;

  if (fail >= maxFailed) {
    await updateState(table, id, "failed");
    return fail;
  }

  if (removeOnFail) {
    await del(table, id);
  } else {
    const res = await pgClient().query(`update ${table} set fail=$2, state=$3 where id = $1`, [id, fail + 1, "wait"]);
    if (res.rowCount === 0) {
      throw new Error(`"set fail number failed:, ${table}, ${id} ${fail}`);
    }
  }

  return fail;
}

// create table and get key,value
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function get(table: string, state: State): Promise<Job | null> {
  table = getTableName(table);
  await createTable(table);

  const res = await pgClient().query(`select id, v from ${table} where read < $1 and state = $2 limit 1`, [
    Date.now(),
    state,
  ]);
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

  const hasDelay = await kvex.get(table, (state === "completed" ? REMOVE_ON_COMPLETE : REMOVE_ON_FAIL) + table);

  if (hasDelay) {
    return;
  }

  table = getTableName(table);
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
  setUnlogged,
};
