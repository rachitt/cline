import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { logger } from "../logger.js";
import {
  parsePagerDutyEvent,
  pagerdutyWebhookGuard,
} from "../integrations/pagerduty.js";
import { getServiceByPagerDutyId } from "../models/services.js";
import {
  createIncident,
  getIncidentByPagerDutyId,
} from "../models/incidents.js";
import { incidentQueue } from "../queue/incident.queue.js";
import type { IncidentJobData } from "../types.js";

export async function webhookRoutes(app: FastifyInstance) {
  /**
   * PagerDuty V3 webhook endpoint.
   * Receives incident.triggered events and enqueues them for processing.
   */
  app.post(
    "/webhooks/pagerduty",
    { preHandler: pagerdutyWebhookGuard },
    async (request, reply) => {
      const incident = parsePagerDutyEvent(request.body);

      if (!incident) {
        // Non-trigger event or unparseable — acknowledge silently
        return reply.status(200).send({ status: "ignored" });
      }

      logger.info(
        { pdIncidentId: incident.id, title: incident.title },
        "Received PagerDuty incident trigger"
      );

      // Idempotency check
      const existing = await getIncidentByPagerDutyId(incident.id);
      if (existing) {
        logger.info(
          { pdIncidentId: incident.id },
          "Duplicate incident, skipping"
        );
        return reply.status(200).send({ status: "duplicate" });
      }

      // Look up service config
      const serviceConfig = await getServiceByPagerDutyId(
        incident.service.id
      );
      if (!serviceConfig) {
        logger.warn(
          { serviceId: incident.service.id, serviceName: incident.service.name },
          "No service config found for PagerDuty service"
        );
        return reply
          .status(200)
          .send({ status: "unmonitored_service" });
      }

      // Create incident record
      const incidentId = crypto.randomUUID();
      await createIncident({
        id: incidentId,
        pagerdutyIncidentId: incident.id,
        title: incident.title,
        urgency: incident.urgency,
        serviceName: serviceConfig.name,
        status: "RECEIVED",
        slackChannelId: serviceConfig.slackChannelId,
      });

      // Enqueue for processing
      const jobData: IncidentJobData = {
        incidentId,
        pagerdutyIncident: incident,
        serviceConfig,
      };

      await incidentQueue.add(`incident-${incidentId}`, jobData, {
        jobId: incidentId, // Dedup key
      });

      logger.info({ incidentId }, "Incident enqueued for processing");

      return reply.status(200).send({ status: "accepted", incidentId });
    }
  );
}
