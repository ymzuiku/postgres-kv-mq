import "./init-kv-config";
import type { Job, State } from "./mq";
import { mqEvents } from "./mq";
import { mqBaseConfig } from "./mq-base-config";
import { Queue, QueueConfig } from "./queue";
import { Worker, WorkerConfig } from "./worker";

export const mq = { Queue, Worker, baseConfig: mqBaseConfig, setUnlogged: mqEvents.setUnlogged };
export type { QueueConfig, WorkerConfig, Job, State };
