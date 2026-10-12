import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './lib/db.js';
import { logger } from './lib/logger.js';
import { closeQueues } from './jobs/queues.js';
import { ensureAllSchedules } from './jobs/scheduler.js';

async function main() {
  await connectDatabase();

  // Repeatable job definitions live in Redis. Re-declaring them at boot is
  // idempotent (BullMQ keys a job scheduler by id) and means a fresh Redis
  // recovers the schedule without manual intervention.
  await ensureAllSchedules();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API listening');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down API');
    server.close();
    await closeQueues();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'API failed to start',);
  console.error("Error starting API:", err);
  process.exit(1);
});
