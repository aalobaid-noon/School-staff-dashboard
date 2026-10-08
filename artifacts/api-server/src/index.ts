import app from "./app";
import { logger } from "./lib/logger";
import { synapse } from "./lib/synapse";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  if (synapse) {
    void synapse.publishEvent("app_booted", { startedAt: new Date().toISOString() })
      .then((result) => {
        if (result.status === "accepted") {
          logger.info("[synapse] OK — app_booted accepted");
        } else {
          logger.warn("[synapse] app_booted queued (Citadel has not accepted it yet)");
        }
      })
      .catch(() => {
        // Never log upstream error text, headers, or credential-bearing configuration.
        logger.error("[synapse] app_booted failed — check Citadel connectivity and event permissions");
      });
  }
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    synapse?.close();
    server.close(() => process.exit(0));
  });
}
