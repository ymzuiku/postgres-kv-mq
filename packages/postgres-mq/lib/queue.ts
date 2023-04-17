import { kv, kvex, waiting } from "postgres-kv";
import { MQ_EX_TABLE, MQ_HAS_JOB, MQ_STATE_TABLE, REMOVE_ON_COMPLETE, REMOVE_ON_FAIL } from "./keys";
import { mqEvents } from "./mq";

export interface QueueConfig {
  sizeLimit?: number;
  removeOnFail?: boolean;
  removeOnFailDelay?: number;
  removeOnComplete?: boolean;
  removeOnCompleteDelay?: number;
}

export const baseQueueConfig: Required<QueueConfig> = {
  sizeLimit: 1024 * 1024 * 10,
  removeOnComplete: false,
  removeOnCompleteDelay: kvex.times.oneWeek,
  removeOnFail: false,
  removeOnFailDelay: kvex.times.oneWeek,
};

let hasJobTimer: NodeJS.Timer | null = null;
let queueing = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function Queue(table: string, data: any, config: QueueConfig = baseQueueConfig) {
  if (queueing) {
    await waiting(17);
    await Queue(table, data, config);
    return;
  }

  queueing = true;

  const { sizeLimit, removeOnFail, removeOnComplete, removeOnCompleteDelay, removeOnFailDelay } =
    config as Required<QueueConfig>;
  const id = await mqEvents.insert(table, "wait", data, sizeLimit);
  if (!hasJobTimer) {
    await kv.set(MQ_STATE_TABLE, MQ_HAS_JOB, true);
  }

  if (hasJobTimer) {
    clearTimeout(hasJobTimer);
    hasJobTimer = null;
  }

  hasJobTimer = setTimeout(async () => {
    await kv.set(MQ_STATE_TABLE, MQ_HAS_JOB, false);

    if (removeOnFail) {
      if (removeOnFailDelay > 0) {
        await kvex.setOnceEx(MQ_EX_TABLE, REMOVE_ON_FAIL + table, removeOnFailDelay, true);
      }
      mqEvents.delByState(table, "failed");
    }
    if (removeOnComplete) {
      if (removeOnCompleteDelay > 0) {
        await kvex.setOnceEx(MQ_EX_TABLE, REMOVE_ON_COMPLETE + table, removeOnCompleteDelay, true);
      }
      mqEvents.delByState(table, "completed");
    }
  }, kvex.config.clearInterval);

  queueing = false;

  return id;
}
