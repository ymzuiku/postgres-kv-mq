import { kv, kvex, waiting } from "postgres-kv";
import { MQ_HAS_JOB, MQ_STATE_TABLE, MQ_TASK_NUM } from "./keys";
import { Job, mqEvents } from "./mq";

export interface WorkerConfig {
  delay?: number;
  idleWhenEmpty?: number;
  maxFailed?: number;
  removeOnComplete?: boolean;
  removeOnFail?: boolean;
  limiter?: {
    max: number;
    duration: number;
  };
}

export const baseWorkerConfig: Required<WorkerConfig> = {
  idleWhenEmpty: 3000,
  delay: 0,
  maxFailed: 5,
  removeOnComplete: false,
  removeOnFail: false,
  limiter: {
    max: 5000,
    duration: 1000,
  },
};

type JobEvent = (job: Job) => unknown;
type FailedJobEvent = (error: Error, job?: Job) => unknown;
// "wait" | "active" | "completed" | "failed";
const activeEvents: JobEvent[] = [];
const completedEvents: JobEvent[] = [];
const failedEvents: FailedJobEvent[] = [];

export async function Worker(
  table: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (job: Omit<Job, "response">) => any | Promise<any>,
  config: WorkerConfig = baseWorkerConfig,
) {
  const { limiter, delay, idleWhenEmpty, maxFailed, removeOnComplete, removeOnFail } = config as Required<WorkerConfig>;

  const task = async () => {
    try {
      const taskNum = (await kvex.get<number>(MQ_STATE_TABLE, MQ_TASK_NUM)) || 0;
      if (taskNum >= limiter.max) {
        await waiting(Math.max(limiter.duration / limiter.max, 200));
        task();
        return;
      }
      if (taskNum === 0) {
        await kvex.setEx(MQ_STATE_TABLE, MQ_TASK_NUM, limiter.duration, 1);
      } else {
        try {
          await kvex.update(MQ_STATE_TABLE, MQ_TASK_NUM, taskNum + 1);
        } catch (err) {
          //
        }
      }
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      failedEvents.forEach((v) => v(err as any));
      return;
    }
    if (delay > 0) {
      await waiting(delay);
    }

    try {
      const job = await mqEvents.get(table, "wait");

      if (job) {
        activeEvents.forEach((v) => v(job));

        await mqEvents.updateState(table, job.id, "active");

        try {
          const response = await Promise.resolve(fn(job));
          if (removeOnComplete) {
            await mqEvents.del(table, job.id);
          } else {
            await mqEvents.updateState(table, job.id, "completed");
          }

          completedEvents.forEach((v) => v({ ...job, response }));
        } catch (err) {
          let failedCount: number | undefined = void 0;
          try {
            failedCount = await mqEvents.updateFailNumber(table, job.id, maxFailed, removeOnFail);
          } catch (err) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            failedEvents.forEach((v) => v(err as any, { ...job, failedCount }));
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          failedEvents.forEach((v) => v(err as any, { ...job, failedCount }));
        }
      }
      if (!job) {
        const hasJob = await kv.get<boolean>(MQ_STATE_TABLE, MQ_HAS_JOB);
        if (!hasJob) {
          await waiting(idleWhenEmpty);
        }
      }
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      failedEvents.forEach((v) => v(err as any));
    }
    task();
  };
  task();
}

Worker.addListenerActive = (event: JobEvent) => {
  activeEvents.push(event);
};

Worker.addListenerCompleted = (event: JobEvent) => {
  completedEvents.push(event);
};

Worker.addListenerFailed = (event: FailedJobEvent) => {
  failedEvents.push(event);
};
