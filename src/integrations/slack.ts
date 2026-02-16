import { App } from "@slack/bolt";
import { config } from "../config.js";
import { logger } from "../logger.js";
import type { DiagnosisResult, IncidentStatus } from "../types.js";
import * as incidentModel from "../models/incidents.js";
import * as github from "./github.js";
import * as serviceModel from "../models/services.js";

export const slackApp = new App({
  token: config.SLACK_BOT_TOKEN,
  signingSecret: config.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: config.SLACK_APP_TOKEN,
});

// ─── Message Builders ────────────────────────────────────────

const SEVERITY_EMOJI: Record<string, string> = {
  high: ":red_circle:",
  low: ":large_yellow_circle:",
};

/**
 * Posts the initial "Investigating..." message when an incident is received.
 */
export async function postIncidentReceived(
  channelId: string,
  incidentId: string,
  title: string,
  urgency: string,
  serviceName: string
): Promise<string> {
  const result = await slackApp.client.chat.postMessage({
    channel: channelId,
    text: `Incident received: ${title}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${urgency === "high" ? "🚨" : "⚠️"} Incident: ${title}`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Severity:* ${SEVERITY_EMOJI[urgency] || ":white_circle:"} ${urgency.toUpperCase()}`,
          },
          {
            type: "mrkdwn",
            text: `*Service:* ${serviceName}`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: ":mag: *Status:* Investigating... fetching logs and analyzing.",
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Incident ID: \`${incidentId}\``,
          },
        ],
      },
    ],
  });

  return result.ts!;
}

/**
 * Updates the Slack message with progress as each phase completes.
 */
export async function updateIncidentProgress(
  channelId: string,
  messageTs: string,
  title: string,
  urgency: string,
  serviceName: string,
  status: IncidentStatus
): Promise<void> {
  const statusMessages: Record<string, string> = {
    FETCHING_LOGS: ":page_facing_up: Fetching logs and stack traces...",
    DIAGNOSING: ":brain: Analyzing root cause with Cline CLI...",
    GENERATING_FIX: ":wrench: Generating code fix...",
    CREATING_PR: ":github: Creating draft pull request...",
    NOTIFYING: ":white_check_mark: Analysis complete! Preparing summary...",
  };

  await slackApp.client.chat.update({
    channel: channelId,
    ts: messageTs,
    text: `Incident update: ${title} - ${status}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${urgency === "high" ? "🚨" : "⚠️"} Incident: ${title}`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Severity:* ${SEVERITY_EMOJI[urgency] || ":white_circle:"} ${urgency.toUpperCase()}`,
          },
          {
            type: "mrkdwn",
            text: `*Service:* ${serviceName}`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: statusMessages[status] || `:hourglass_flowing_sand: ${status}`,
        },
      },
    ],
  });
}

/**
 * Posts the final summary with diagnosis, PR link, and action buttons.
 */
export async function postIncidentSummary(
  channelId: string,
  messageTs: string,
  incidentId: string,
  title: string,
  urgency: string,
  serviceName: string,
  diagnosis: DiagnosisResult,
  prUrl: string | null,
  pagerdutyUrl: string,
  durationMs: number
): Promise<void> {
  const durationSec = Math.round(durationMs / 1000);

  const blocks: any[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `${urgency === "high" ? "🚨" : "⚠️"} Incident Response: ${title}`,
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Severity:* ${SEVERITY_EMOJI[urgency] || ":white_circle:"} ${urgency.toUpperCase()}`,
        },
        {
          type: "mrkdwn",
          text: `*Service:* ${serviceName}`,
        },
        {
          type: "mrkdwn",
          text: `*Confidence:* ${Math.round(diagnosis.confidence * 100)}%`,
        },
        {
          type: "mrkdwn",
          text: `*Risk:* ${diagnosis.riskAssessment}`,
        },
      ],
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*:mag: Root Cause*\n${diagnosis.rootCause}`,
      },
    },
  ];

  if (diagnosis.affectedFiles.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*:file_folder: Affected Files*\n${diagnosis.affectedFiles.map((f) => `• \`${f}\``).join("\n")}`,
      },
    });
  }

  if (diagnosis.proposedChanges.length > 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*:wrench: Proposed Fix*\n${diagnosis.proposedChanges.map((c) => `• \`${c.filePath}\`: ${c.explanation}`).join("\n")}`,
      },
    });
  }

  blocks.push({ type: "divider" });

  // Action buttons
  const actions: any[] = [];
  if (prUrl) {
    actions.push({
      type: "button",
      text: { type: "plain_text", text: "View Draft PR", emoji: true },
      url: prUrl,
      style: "primary",
    });
    actions.push({
      type: "button",
      text: { type: "plain_text", text: "Approve Fix", emoji: true },
      action_id: `approve_fix_${incidentId}`,
      style: "primary",
    });
    actions.push({
      type: "button",
      text: { type: "plain_text", text: "Reject Fix", emoji: true },
      action_id: `reject_fix_${incidentId}`,
      style: "danger",
    });
  }
  if (pagerdutyUrl) {
    actions.push({
      type: "button",
      text: { type: "plain_text", text: "View in PagerDuty", emoji: true },
      url: pagerdutyUrl,
    });
  }

  if (actions.length > 0) {
    blocks.push({ type: "actions", elements: actions });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `:clock1: Diagnosed in ${durationSec}s | Incident ID: \`${incidentId}\``,
      },
    ],
  });

  // Update the original message with the full summary
  await slackApp.client.chat.update({
    channel: channelId,
    ts: messageTs,
    text: `Incident Response Complete: ${title}`,
    blocks,
  });
}

/**
 * Posts a failure message when the bot can't complete analysis.
 */
export async function postIncidentFailure(
  channelId: string,
  messageTs: string | null,
  incidentId: string,
  title: string,
  errorMessage: string
): Promise<void> {
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `❌ Incident Response Failed: ${title}`,
        emoji: true,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `The automated responder could not complete analysis.\n*Error:* ${errorMessage}\n\nPlease investigate manually.`,
      },
    },
    {
      type: "context",
      elements: [
        { type: "mrkdwn", text: `Incident ID: \`${incidentId}\`` },
      ],
    },
  ];

  if (messageTs) {
    await slackApp.client.chat.update({
      channel: channelId,
      ts: messageTs,
      text: `Incident Response Failed: ${title}`,
      blocks,
    });
  } else {
    await slackApp.client.chat.postMessage({
      channel: channelId,
      text: `Incident Response Failed: ${title}`,
      blocks,
    });
  }
}

// ─── Action Handlers ─────────────────────────────────────────

export function registerSlackActions() {
  // Handle "Approve Fix" button
  slackApp.action(/approve_fix_(.+)/, async ({ action, ack, say }) => {
    await ack();
    const incidentId = (action as any).action_id.replace("approve_fix_", "");

    try {
      const incident = await incidentModel.getIncident(incidentId);
      if (!incident || !incident.prNumber) {
        await say(`Could not find PR for incident \`${incidentId}\`.`);
        return;
      }

      // Look up service config to get repo info
      const allServices = await serviceModel.listServices();
      const svc = allServices.find((s) => s.name === incident.serviceName);
      if (!svc) {
        await say(`Could not find service config for \`${incident.serviceName}\`.`);
        return;
      }

      await github.markPRReadyForReview(
        svc.repoOwner,
        svc.repoName,
        incident.prNumber
      );

      await say(
        `:white_check_mark: PR #${incident.prNumber} has been marked as ready for review.`
      );
    } catch (err) {
      logger.error({ err, incidentId }, "Failed to approve fix");
      await say(`Failed to approve fix: ${(err as Error).message}`);
    }
  });

  // Handle "Reject Fix" button
  slackApp.action(/reject_fix_(.+)/, async ({ action, ack, say }) => {
    await ack();
    const incidentId = (action as any).action_id.replace("reject_fix_", "");

    try {
      const incident = await incidentModel.getIncident(incidentId);
      if (!incident || !incident.prNumber) {
        await say(`Could not find PR for incident \`${incidentId}\`.`);
        return;
      }

      const allServices = await serviceModel.listServices();
      const svc = allServices.find((s) => s.name === incident.serviceName);
      if (!svc) {
        await say(`Could not find service config for \`${incident.serviceName}\`.`);
        return;
      }

      await github.closePR(svc.repoOwner, svc.repoName, incident.prNumber);

      await say(
        `:x: PR #${incident.prNumber} has been closed. Manual investigation required.`
      );
    } catch (err) {
      logger.error({ err, incidentId }, "Failed to reject fix");
      await say(`Failed to reject fix: ${(err as Error).message}`);
    }
  });
}
