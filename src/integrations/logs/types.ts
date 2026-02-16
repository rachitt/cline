import type { LogQuery, LogResult } from "../../types.js";

export interface LogSource {
  name: string;
  fetchLogs(query: LogQuery): Promise<LogResult>;
}
