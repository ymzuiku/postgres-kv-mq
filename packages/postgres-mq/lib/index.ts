import { Job, State } from "./mq";
import { mqBaseConfig } from "./mq-base-config";
import { Queue, QueueConfig } from "./queue";
import { Worker, WorkerConfig } from "./worker";

export const mq = { Queue, Worker, baseConfig: mqBaseConfig };
export type { QueueConfig, WorkerConfig, Job, State };
