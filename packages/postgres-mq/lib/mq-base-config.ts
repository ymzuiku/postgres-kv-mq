import { deepMerge } from "postgres-kv";
import { QueueConfig, baseQueueConfig } from "./queue";
import { WorkerConfig, baseWorkerConfig } from "./worker";

interface MQBaseConfig {
  workerConfig?: WorkerConfig;
  queueConfig?: QueueConfig;
}
export const mqBaseConfig = ({ workerConfig, queueConfig }: MQBaseConfig) => {
  deepMerge(baseWorkerConfig, workerConfig);
  deepMerge(baseQueueConfig, queueConfig);
};
