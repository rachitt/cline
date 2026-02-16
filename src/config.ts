import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),

  // Anthropic
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),

  // PagerDuty
  PAGERDUTY_WEBHOOK_SECRET: z.string().min(1),
  PAGERDUTY_API_TOKEN: z.string().min(1),

  // Slack
  SLACK_BOT_TOKEN: z.string().startsWith("xoxb-"),
  SLACK_SIGNING_SECRET: z.string().min(1),
  SLACK_APP_TOKEN: z.string().startsWith("xapp-"),

  // GitHub
  GITHUB_TOKEN: z.string().min(1),
  GITHUB_DEFAULT_ORG: z.string().default(""),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().min(1),

  // Log Sources (optional)
  DATADOG_API_KEY: z.string().default(""),
  DATADOG_APP_KEY: z.string().default(""),
  DATADOG_SITE: z.string().default("datadoghq.com"),

  // Cline CLI
  CLINE_CLI_PATH: z.string().default("claude"),
  CLINE_TIMEOUT_MS: z.coerce.number().default(300000),
  CLINE_MAX_TURNS: z.coerce.number().default(25),
});

function loadConfig() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:");
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}

export const config = loadConfig();
export type Config = z.infer<typeof envSchema>;
