import { pgClient } from "./connect";
import { safeSql, waiting } from "./utils";

export type State = "wait" | "active" | "completed" | "failed";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Job = { id: number; data: any; response?: any; failedCount?: number };

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
    k varchar(2048) NOT NULL PRIMARY KEY,
    v varchar(81920),
    updateAt timestamptz NOT NULL DEFAULT now()
  );
  create index if not exists idx_updateAt on ${table} using BTREE(updateAt);
  `);
  cacheTable[table] = 2;
}

function getTableName(table: string) {
  if (/^kv_/.test(table)) {
    return safeSql(table);
  }
  return "kv_" + safeSql(table);
}

// create table and set key,value
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function set(table: string, key: string, v: any) {
  table = getTableName(table);
  await createTable(table);

  v = JSON.stringify({ v });

  const res = await pgClient().query(
    `insert into ${table} (k, v) values ($1, $2) on conflict(k) do update set v = excluded.v`,
    [key, v],
  );
  if (res.rowCount === 0) {
    throw new Error(`"set failed:, ${table}, ${key}, ${v}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function setOnce(table: string, key: string, v: any) {
  const value = await get(table, key);
  if (value === null) {
    set(table, key, v);
  }
}

// create table and get key,value
async function get<T>(table: string, key: string): Promise<T | null> {
  table = getTableName(table);
  await createTable(table);

  const res = await pgClient().query(`select v from ${table} where k = $1`, [key]);
  if (res.rowCount === 0) {
    return null;
  }
  const data = res.rows[0].v;
  return data ? JSON.parse(data).v : null;
}

// create table and del key
async function del<T>(table: string, key: string): Promise<T | null> {
  table = getTableName(table);
  await createTable(table);
  const res = await pgClient().query(`delete from ${table} where k = $1`, [key]);
  if (res.rowCount === 0) {
    return null;
  }
  const data = res.rows[0].v;
  return data ? JSON.parse(data).v : null;
}

export const kv = {
  set,
  setOnce,
  get,
  del,
};
