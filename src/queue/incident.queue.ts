import { Queue } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config.js";
import type { IncidentJobData } from "../types.js";

export const redis = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ
  tls: config.REDIS_URL.startsWith("rediss://") ? {} : undefined,
});

export const incidentQueue = new Queue<IncidentJobData>("incident-response", {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 30000, // 30s, 60s, 120s
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
});
