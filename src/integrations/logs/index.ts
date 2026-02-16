import { config } from "../../config.js";
import type { LogSource } from "./types.js";
import { MockLogSource } from "./mock.js";
import { DatadogLogSource } from "./datadog.js";

const sources: Record<string, () => LogSource> = {
  mock: () => new MockLogSource(),
  datadog: () => new DatadogLogSource(),
};

export function getLogSource(name: string): LogSource {
  const factory = sources[name];
  if (!factory) {
    throw new Error(`Unknown log source: ${name}. Available: ${Object.keys(sources).join(", ")}`);
  }
  return factory();
}

export type { LogSource };
