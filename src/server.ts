import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { apiRoutes } from "./routes/api.js";
import { startIncidentWorker } from "./queue/incident.worker.js";
import { slackApp, registerSlackActions } from "./integrations/slack.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const app = Fastify({
    logger: false, // We use our own pino logger
  });

  // ─── Plugins ─────────────────────────────────────────────
  await app.register(cors, {
    origin: config.NODE_ENV === "production" ? false : true,
  });

  // Serve the dashboard UI in production
  const uiPath = path.join(__dirname, "ui");
  await app.register(fastifyStatic, {
    root: uiPath,
    prefix: "/dashboard/",
    decorateReply: false,
  });

  // ─── Routes ──────────────────────────────────────────────
  await app.register(webhookRoutes);
  await app.register(apiRoutes);

  // Root redirect to dashboard
  app.get("/", async (_, reply) => {
    return reply.redirect("/dashboard/");
  });

  // Health check at root level
  app.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }));

  // ─── Start BullMQ worker ─────────────────────────────────
  const worker = startIncidentWorker();

  // ─── Start Slack app (Socket Mode) ───────────────────────
  registerSlackActions();
  await slackApp.start();
  logger.info("Slack app started in socket mode");

  // ─── Start HTTP server ───────────────────────────────────
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  logger.info({ port: config.PORT }, "Incident Responder server started");

  // ─── Graceful shutdown ───────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down...");
    await worker.close();
    await slackApp.stop();
    await app.close();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.fatal({ err }, "Failed to start server");
  process.exit(1);
});
