import { eq } from "drizzle-orm";
import { db } from "./db.js";
import { services } from "./schema.js";
import type { ServiceConfig } from "../types.js";

export async function getServiceByPagerDutyId(
  pdServiceId: string
): Promise<ServiceConfig | undefined> {
  const rows = await db
    .select()
    .from(services)
    .where(eq(services.pagerdutyServiceId, pdServiceId))
    .limit(1);

  if (!rows[0]) return undefined;

  const row = rows[0];
  return {
    id: row.id,
    name: row.name,
    pagerdutyServiceId: row.pagerdutyServiceId,
    repoOwner: row.repoOwner,
    repoName: row.repoName,
    defaultBranch: row.defaultBranch,
    slackChannelId: row.slackChannelId,
    logSource: row.logSource as ServiceConfig["logSource"],
    logQuery: row.logQuery ?? undefined,
  };
}

export async function upsertService(svc: ServiceConfig): Promise<void> {
  await db
    .insert(services)
    .values({
      id: svc.id,
      name: svc.name,
      pagerdutyServiceId: svc.pagerdutyServiceId,
      repoOwner: svc.repoOwner,
      repoName: svc.repoName,
      defaultBranch: svc.defaultBranch,
      slackChannelId: svc.slackChannelId,
      logSource: svc.logSource,
      logQuery: svc.logQuery,
    })
    .onConflictDoUpdate({
      target: services.pagerdutyServiceId,
      set: {
        name: svc.name,
        repoOwner: svc.repoOwner,
        repoName: svc.repoName,
        defaultBranch: svc.defaultBranch,
        slackChannelId: svc.slackChannelId,
        logSource: svc.logSource,
        logQuery: svc.logQuery,
        updatedAt: new Date(),
      },
    });
}

export async function listServices() {
  return db.select().from(services).where(eq(services.active, true));
}

export async function deleteService(id: string): Promise<void> {
  await db
    .update(services)
    .set({ active: false, updatedAt: new Date() })
    .where(eq(services.id, id));
}
