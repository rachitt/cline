import crypto from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import { config } from "../config.js";
import { logger } from "../logger.js";
import type { PagerDutyIncident } from "../types.js";

/**
 * Validates PagerDuty V3 webhook signature.
 * PagerDuty signs the payload with HMAC-SHA256 using the webhook secret.
 */
export function verifyPagerDutySignature(
  payload: string,
  signature: string | undefined
): boolean {
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", config.PAGERDUTY_WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");

  // PagerDuty sends signature as "v1=<hex>"
  const sigValue = signature.startsWith("v1=")
    ? signature.slice(3)
    : signature;

  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(sigValue, "hex")
  );
}

/**
 * Parses a PagerDuty V3 webhook event payload into our incident type.
 */
export function parsePagerDutyEvent(body: any): PagerDutyIncident | null {
  try {
    const event = body?.event;
    if (!event || event.event_type !== "incident.triggered") {
      logger.debug(
        { eventType: event?.event_type },
        "Ignoring non-trigger PagerDuty event"
      );
      return null;
    }

    const data = event.data;

    const alertDetails: string[] = [];
    if (data.body?.details) {
      alertDetails.push(
        typeof data.body.details === "string"
          ? data.body.details
          : JSON.stringify(data.body.details)
      );
    }

    return {
      id: data.id,
      title: data.title,
      urgency: data.urgency ?? "high",
      status: data.status,
      service: {
        id: data.service?.id ?? "unknown",
        name: data.service?.summary ?? "unknown",
      },
      createdAt: data.created_at ?? new Date().toISOString(),
      htmlUrl: data.html_url ?? "",
      alertDetails,
    };
  } catch (err) {
    logger.error({ err }, "Failed to parse PagerDuty event");
    return null;
  }
}

/**
 * Fastify pre-handler for PagerDuty webhook signature verification.
 */
export async function pagerdutyWebhookGuard(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const rawBody = JSON.stringify(request.body);
  const signature = request.headers["x-pagerduty-signature"] as
    | string
    | undefined;

  if (!verifyPagerDutySignature(rawBody, signature)) {
    logger.warn("Invalid PagerDuty webhook signature");
    return reply.status(401).send({ error: "Invalid signature" });
  }
}
