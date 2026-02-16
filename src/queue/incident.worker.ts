import { Worker, Job } from "bullmq";
import { redis } from "./incident.queue.js";
import { logger } from "../logger.js";
import { getLogSource } from "../integrations/logs/index.js";
import { diagnoseIncident, applyFix } from "../cline/invoker.js";
import * as github from "../integrations/github.js";
import * as slack from "../integrations/slack.js";
import * as incidentModel from "../models/incidents.js";
import type { IncidentJobData, LogQuery } from "../types.js";

/**
 * The incident worker orchestrates the full response pipeline:
 * 1. Post initial Slack message
 * 2. Fetch logs from configured source
 * 3. Invoke Cline CLI for diagnosis
 * 4. Create a fix branch and apply changes
 * 5. Open a draft PR
 * 6. Post the summary to Slack
 */
async function processIncident(job: Job<IncidentJobData>): Promise<void> {
  const { incidentId, pagerdutyIncident, serviceConfig } = job.data;
  const startTime = Date.now();

  logger.info(
    { incidentId, service: serviceConfig.name },
    "Processing incident"
  );

  let slackMessageTs: string | undefined;

  try {
    // ─── Phase 1: Post initial Slack message ─────────────────
    await incidentModel.updateIncidentStatus(incidentId, "FETCHING_LOGS");

    slackMessageTs = await slack.postIncidentReceived(
      serviceConfig.slackChannelId,
      incidentId,
      pagerdutyIncident.title,
      pagerdutyIncident.urgency,
      serviceConfig.name
    );

    await incidentModel.updateIncidentStatus(incidentId, "FETCHING_LOGS", {
      slackMessageTs,
    });

    // ─── Phase 2: Fetch logs ─────────────────────────────────
    await slack.updateIncidentProgress(
      serviceConfig.slackChannelId,
      slackMessageTs,
      pagerdutyIncident.title,
      pagerdutyIncident.urgency,
      serviceConfig.name,
      "FETCHING_LOGS"
    );

    const logSource = getLogSource(serviceConfig.logSource);
    const alertTime = new Date(pagerdutyIncident.createdAt);

    const logQuery: LogQuery = {
      service: serviceConfig.name,
      environment: "production",
      startTime: new Date(alertTime.getTime() - 5 * 60 * 1000), // -5 min
      endTime: new Date(alertTime.getTime() + 2 * 60 * 1000), // +2 min
      severity: "ERROR",
      maxLines: 200,
    };

    const logs = await logSource.fetchLogs(logQuery);
    logger.info(
      { incidentId, lines: logs.rawLines, traces: logs.stackTraces.length },
      "Logs fetched"
    );

    // ─── Phase 3: Clone repo and invoke Cline for diagnosis ──
    await incidentModel.updateIncidentStatus(incidentId, "DIAGNOSING");
    await slack.updateIncidentProgress(
      serviceConfig.slackChannelId,
      slackMessageTs,
      pagerdutyIncident.title,
      pagerdutyIncident.urgency,
      serviceConfig.name,
      "DIAGNOSING"
    );

    const repoDir = await github.ensureRepoClone(
      serviceConfig.repoOwner,
      serviceConfig.repoName,
      serviceConfig.defaultBranch
    );

    const diagnosis = await diagnoseIncident(
      pagerdutyIncident,
      logs,
      serviceConfig,
      repoDir
    );

    logger.info(
      {
        incidentId,
        confidence: diagnosis.confidence,
        risk: diagnosis.riskAssessment,
        files: diagnosis.affectedFiles.length,
      },
      "Diagnosis complete"
    );

    await incidentModel.updateIncidentStatus(incidentId, "GENERATING_FIX", {
      diagnosisResult: diagnosis,
    });

    // ─── Phase 4: Create fix branch and apply changes ────────
    let prUrl: string | null = null;
    let prNumber: number | undefined;

    // Only create PR if confidence is reasonable and risk isn't too high
    if (
      diagnosis.confidence >= 0.3 &&
      diagnosis.proposedChanges.length > 0
    ) {
      await slack.updateIncidentProgress(
        serviceConfig.slackChannelId,
        slackMessageTs,
        pagerdutyIncident.title,
        pagerdutyIncident.urgency,
        serviceConfig.name,
        "GENERATING_FIX"
      );

      const branchName = await github.createFixBranch(repoDir, incidentId);

      // Run Cline's fix application pass
      await applyFix(diagnosis.rawOutput, serviceConfig, repoDir);

      // Commit and push
      await github.commitAndPush(
        repoDir,
        branchName,
        `fix: automated incident response for ${pagerdutyIncident.title}\n\nIncident ID: ${incidentId}\nRoot cause: ${diagnosis.rootCause.slice(0, 200)}`
      );

      // ─── Phase 5: Create draft PR ───────────────────────────
      await incidentModel.updateIncidentStatus(incidentId, "CREATING_PR");
      await slack.updateIncidentProgress(
        serviceConfig.slackChannelId,
        slackMessageTs,
        pagerdutyIncident.title,
        pagerdutyIncident.urgency,
        serviceConfig.name,
        "CREATING_PR"
      );

      const pr = await github.createDraftPR(
        serviceConfig.repoOwner,
        serviceConfig.repoName,
        branchName,
        serviceConfig.defaultBranch,
        incidentId,
        diagnosis,
        pagerdutyIncident.htmlUrl
      );

      prUrl = pr.prUrl;
      prNumber = pr.prNumber;

      await incidentModel.updateIncidentStatus(incidentId, "NOTIFYING", {
        prUrl,
        prNumber,
      });
    } else {
      logger.info(
        { incidentId, confidence: diagnosis.confidence },
        "Skipping PR creation due to low confidence or no changes"
      );
    }

    // ─── Phase 6: Post final summary to Slack ────────────────
    const durationMs = Date.now() - startTime;

    await slack.postIncidentSummary(
      serviceConfig.slackChannelId,
      slackMessageTs,
      incidentId,
      pagerdutyIncident.title,
      pagerdutyIncident.urgency,
      serviceConfig.name,
      diagnosis,
      prUrl,
      pagerdutyIncident.htmlUrl,
      durationMs
    );

    await incidentModel.updateIncidentStatus(incidentId, "COMPLETED");

    logger.info(
      { incidentId, durationMs, prUrl },
      "Incident processing completed"
    );
  } catch (err) {
    logger.error({ err, incidentId }, "Incident processing failed");

    await incidentModel.updateIncidentStatus(incidentId, "FAILED", {
      errorMessage: (err as Error).message,
    });

    // Notify Slack of failure
    try {
      await slack.postIncidentFailure(
        serviceConfig.slackChannelId,
        slackMessageTs ?? null,
        incidentId,
        pagerdutyIncident.title,
        (err as Error).message
      );
    } catch (slackErr) {
      logger.error({ slackErr }, "Failed to post failure message to Slack");
    }

    throw err; // Re-throw so BullMQ can retry
  }
}

/**
 * Starts the BullMQ worker that processes incident jobs.
 */
export function startIncidentWorker(): Worker<IncidentJobData> {
  const worker = new Worker<IncidentJobData>(
    "incident-response",
    processIncident,
    {
      connection: redis,
      concurrency: 2, // Process up to 2 incidents at a time
      limiter: {
        max: 5,
        duration: 60000, // Max 5 jobs per minute
      },
    }
  );

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Incident job completed");
  });

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, err: err.message, attempts: job?.attemptsMade },
      "Incident job failed"
    );
  });

  logger.info("Incident worker started");
  return worker;
}
