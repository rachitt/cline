import { eq } from "drizzle-orm";
import { db } from "./db.js";
import { incidents } from "./schema.js";
import type { IncidentState, IncidentStatus, DiagnosisResult } from "../types.js";

export async function createIncident(
  incident: Omit<IncidentState, "startedAt" | "completedAt">
): Promise<void> {
  await db.insert(incidents).values({
    id: incident.id,
    pagerdutyIncidentId: incident.pagerdutyIncidentId,
    title: incident.title,
    urgency: incident.urgency,
    serviceName: incident.serviceName,
    status: incident.status,
    slackChannelId: incident.slackChannelId,
  });
}

export async function updateIncidentStatus(
  id: string,
  status: IncidentStatus,
  extra?: {
    slackMessageTs?: string;
    diagnosisResult?: DiagnosisResult;
    prUrl?: string;
    prNumber?: number;
    errorMessage?: string;
  }
): Promise<void> {
  const updates: Record<string, unknown> = { status };

  if (extra?.slackMessageTs) updates.slackMessageTs = extra.slackMessageTs;
  if (extra?.diagnosisResult)
    updates.diagnosisResult = extra.diagnosisResult;
  if (extra?.prUrl) updates.prUrl = extra.prUrl;
  if (extra?.prNumber) updates.prNumber = extra.prNumber;
  if (extra?.errorMessage) updates.errorMessage = extra.errorMessage;
  if (status === "COMPLETED" || status === "FAILED") {
    updates.completedAt = new Date();
  }

  await db.update(incidents).set(updates).where(eq(incidents.id, id));
}

export async function getIncidentByPagerDutyId(
  pdId: string
): Promise<typeof incidents.$inferSelect | undefined> {
  const rows = await db
    .select()
    .from(incidents)
    .where(eq(incidents.pagerdutyIncidentId, pdId))
    .limit(1);
  return rows[0];
}

export async function getIncident(
  id: string
): Promise<typeof incidents.$inferSelect | undefined> {
  const rows = await db
    .select()
    .from(incidents)
    .where(eq(incidents.id, id))
    .limit(1);
  return rows[0];
}

export async function listIncidents(limit = 50) {
  return db.select().from(incidents).orderBy(incidents.startedAt).limit(limit);
}
