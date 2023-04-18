import { Pool, PoolClient } from "pg";

const cache = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: null as any,
  pg: null as never as Pool,
};

export function pgConnect(urlOrPool?: string | Pool | PoolClient) {
  if (cache.pg) {
    return;
  }
  if (typeof urlOrPool === "object") {
    cache.pg = urlOrPool as Pool;
    return;
  }
  if (!urlOrPool) {
    urlOrPool = process.env["DATABASE_URL"];
  }
  cache.pg = new Pool({ connectionString: urlOrPool as string, max: 5, maxUses: 5 });
}

export function pgClient() {
  return cache.pg;
}
