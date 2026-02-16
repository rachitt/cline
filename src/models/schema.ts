import {
  pgTable,
  text,
  timestamp,
  varchar,
  integer,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";

export const incidents = pgTable("incidents", {
  id: text("id").primaryKey(),
  pagerdutyIncidentId: varchar("pagerduty_incident_id", { length: 255 })
    .notNull()
    .unique(),
  title: text("title").notNull(),
  urgency: varchar("urgency", { length: 10 }).notNull(),
  serviceName: varchar("service_name", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("RECEIVED"),
  slackMessageTs: varchar("slack_message_ts", { length: 100 }),
  slackChannelId: varchar("slack_channel_id", { length: 100 }),
  diagnosisResult: jsonb("diagnosis_result"),
  prUrl: text("pr_url"),
  prNumber: integer("pr_number"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const services = pgTable("services", {
  id: text("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  pagerdutyServiceId: varchar("pagerduty_service_id", { length: 255 })
    .notNull()
    .unique(),
  repoOwner: varchar("repo_owner", { length: 255 }).notNull(),
  repoName: varchar("repo_name", { length: 255 }).notNull(),
  defaultBranch: varchar("default_branch", { length: 100 })
    .notNull()
    .default("main"),
  slackChannelId: varchar("slack_channel_id", { length: 100 }).notNull(),
  logSource: varchar("log_source", { length: 50 }).notNull().default("mock"),
  logQuery: text("log_query"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
