import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import * as incidentModel from "../models/incidents.js";
import * as serviceModel from "../models/services.js";
import type { ServiceConfig } from "../types.js";

export async function apiRoutes(app: FastifyInstance) {
  // ─── Incidents ──────────────────────────────────────────────

  app.get("/api/incidents", async () => {
    return incidentModel.listIncidents();
  });

  app.get<{ Params: { id: string } }>(
    "/api/incidents/:id",
    async (request, reply) => {
      const incident = await incidentModel.getIncident(request.params.id);
      if (!incident) {
        return reply.status(404).send({ error: "Incident not found" });
      }
      return incident;
    }
  );

  // ─── Services ───────────────────────────────────────────────

  app.get("/api/services", async () => {
    return serviceModel.listServices();
  });

  app.post<{ Body: Omit<ServiceConfig, "id"> }>(
    "/api/services",
    async (request) => {
      const id = crypto.randomUUID();
      const svc: ServiceConfig = { id, ...request.body };
      await serviceModel.upsertService(svc);
      return { id, status: "created" };
    }
  );

  app.put<{ Params: { id: string }; Body: Omit<ServiceConfig, "id"> }>(
    "/api/services/:id",
    async (request) => {
      const svc: ServiceConfig = { id: request.params.id, ...request.body };
      await serviceModel.upsertService(svc);
      return { status: "updated" };
    }
  );

  app.delete<{ Params: { id: string } }>(
    "/api/services/:id",
    async (request) => {
      await serviceModel.deleteService(request.params.id);
      return { status: "deleted" };
    }
  );

  // ─── Health ─────────────────────────────────────────────────

  app.get("/api/health", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
    };
  });
}
