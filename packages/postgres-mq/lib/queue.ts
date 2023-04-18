import { kv } from "postgres-kv";
import { MQ_HAS_JOB, MQ_STATE_TABLE } from "./keys";
import { mqEvents } from "./mq";

export interface QueueConfig {
  sizeLimit?: number;
  delay?: number;
  // mergeInsert?: number;
  // maxIdleCount?: number;
}

export const baseQueueConfig: Required<QueueConfig> = {
  sizeLimit: 1024 * 1024 * 10,
  // mergeInsert: 0,
  delay: 0,
  // maxIdleCount: 200,
};

let hasJobTimer: NodeJS.Timer | null = null;

// let caches: Record<string, DataItem[]> = {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function Queue(table: string, data: any, config: QueueConfig = baseQueueConfig) {
  const { sizeLimit, delay } = config as Required<QueueConfig>;

  await mqEvents.insert(table, "wait", [
    {
      data,
      delay,
      sizeLimit,
    },
  ]);
  if (!hasJobTimer) {
    await kv.set(MQ_STATE_TABLE, MQ_HAS_JOB, true);
  }

  if (hasJobTimer) {
    clearTimeout(hasJobTimer);
    hasJobTimer = null;
  }

  hasJobTimer = setTimeout(async () => {
    await kv.set(MQ_STATE_TABLE, MQ_HAS_JOB, false);
  }, 2000);
}
