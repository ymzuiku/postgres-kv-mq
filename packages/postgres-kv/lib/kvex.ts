import { pgClient } from "./connect";
import { safeSql, waiting } from "./utils";

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
    ex bigint NOT NULL,
    updateAt timestamptz NOT NULL DEFAULT now()
  );
  create index if not exists ${table}_updateAt on kvex using BTREE(ex);
  create index if not exists ${table}_ex on kvex using BTREE(ex);
  `);
  cacheTable[table] = 2;
}

function getTableName(table: string) {
  return "kvex_" + safeSql(table);
}

// 每 1 分钟清理一次
const kvexConfig = {
  clearInterval: 1000 * 60 * 1,
};
const cacheTimes = new Map<string, number>();

async function clearTable(table: string) {
  const now = Date.now();
  const t = cacheTimes.get(table) || now + kvexConfig.clearInterval;
  if (t < now) {
    return;
  }
  await pgClient().query(`delete from ${table} where ex < $1`, [now]);
  cacheTimes.set(table, now + kvexConfig.clearInterval);
}

// create table and set key,value
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function setEx(table: string, key: string, expireSecond: number, v: any) {
  table = getTableName(table);
  await createTable(table);
  await clearTable(table);

  const res = await pgClient().query(
    `insert into ${table} (k, v, ex) values ($1, $2, $3) on conflict(k) do update set v = excluded.v, ex = excluded.ex`,
    [key, JSON.stringify({ v }), Date.now() + expireSecond * 1000],
  );
  if (res.rowCount === 0) {
    throw new Error(`"setEx failed:, ${table}, ${key}, ${v}`);
  }
}

// create table and set key,value
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function setOnceEx(table: string, key: string, expireSecond: number, v: any) {
  const value = await get(table, key);
  if (value === null) {
    return setEx(table, key, expireSecond, v);
  }
}

// create table and get key,value
async function get<T>(table: string, key: string): Promise<T | null> {
  table = getTableName(table);
  await createTable(table);
  await clearTable(table);

  const res = await pgClient().query(`select v from ${table} where k = $1 and ex > $2`, [key, Date.now()]);
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
  await clearTable(table);

  const res = await pgClient().query(`delete from ${table} where k = $1`, [key]);
  if (res.rowCount === 0) {
    return null;
  }
  const data = res.rows[0].v;
  return data ? JSON.parse(data).v : null;
}

export const kvex = {
  setEx,
  setOnceEx,
  get,
  del,
  config: kvexConfig,
  times: {
    onSecond: 1000,
    oneMinute: 1000 * 60,
    oneHour: 1000 * 60 * 60,
    oneDay: 1000 * 60 * 60 * 24,
    oneWeek: 1000 * 60 * 60 * 24 * 7,
    oneMonth: 1000 * 60 * 60 * 24 * 31,
  },
};
