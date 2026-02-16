import { config } from "../../config.js";
import { logger } from "../../logger.js";
import type { LogSource } from "./types.js";
import type { LogQuery, LogResult } from "../../types.js";

/**
 * Datadog log source adapter.
 * Queries the Datadog Logs Search API for error/fatal logs within a time window.
 */
export class DatadogLogSource implements LogSource {
  name = "datadog";

  private baseUrl: string;

  constructor() {
    this.baseUrl = `https://api.${config.DATADOG_SITE}`;
  }

  async fetchLogs(query: LogQuery): Promise<LogResult> {
    const ddQuery = `service:${query.service} status:${query.severity.toLowerCase()}`;

    const response = await fetch(
      `${this.baseUrl}/api/v2/logs/events/search`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "DD-API-KEY": config.DATADOG_API_KEY,
          "DD-APPLICATION-KEY": config.DATADOG_APP_KEY,
        },
        body: JSON.stringify({
          filter: {
            query: ddQuery,
            from: query.startTime.toISOString(),
            to: query.endTime.toISOString(),
          },
          sort: "-timestamp",
          page: {
            limit: query.maxLines,
          },
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      logger.error(
        { status: response.status, body },
        "Datadog API request failed"
      );
      throw new Error(`Datadog API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    const events = data?.data ?? [];

    const logLines: string[] = [];
    const stackTraces: string[] = [];

    for (const event of events) {
      const attrs = event.attributes ?? {};
      const message = attrs.message ?? attrs.content ?? "";
      const timestamp = attrs.timestamp ?? "";

      logLines.push(`[${timestamp}] ${attrs.status ?? "ERROR"} ${message}`);

      // Extract stack traces from error.stack or message
      const stack = attrs.error?.stack ?? attrs["error.stack"];
      if (stack && !stackTraces.includes(stack)) {
        stackTraces.push(stack);
      }
    }

    return {
      logs: logLines.join("\n"),
      stackTraces: stackTraces.slice(0, 5), // Limit to top 5
      rawLines: events.length,
      truncated: events.length >= query.maxLines,
    };
  }
}
