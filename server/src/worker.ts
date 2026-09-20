import { Worker, UnrecoverableError, type Job } from 'bullmq';
import { env } from './config/env.js';
import { childLogger } from './lib/logger.js';
import { connectDatabase, disconnectDatabase } from './lib/db.js';
import { createRedisConnection, closeSharedRedis } from './lib/redis.js';
import {
  QUEUE_NAMES,
  closeQueues,
  enqueueMedia,
  type MediaJobData,
  type ScrapeJobData,
} from './jobs/queues.js';
import { runSyncForUser } from './modules/sync/service.js';
import { archiveMediaForTweet, findTweetsNeedingMedia } from './modules/media/service.js';
import { ScrapeError } from './scraper/errors.js';

const log = childLogger('worker');

/**
 * The worker process.
 *
 * This runs separately from the API on purpose. A bookmark sync opens a real
 * Chromium instance and can run for minutes; doing that inside an Express
 * request would tie up the API, couple the scrape's lifetime to an HTTP
 * connection, and lose the work entirely if the client disconnected. Here the
 * API only enqueues, and this process owns the slow, failure-prone work.
 */

/** Scraping is memory-heavy (one Chromium per job) — one at a time per process. */
const SCRAPE_CONCURRENCY = 1;
/** Uploads are I/O-bound; a handful in parallel is comfortably safe. */
const MEDIA_CONCURRENCY = 4;

/** How often to look for media that never got archived. */
const MEDIA_SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const MEDIA_SWEEP_BATCH = 50;

async function processScrape(job: Job<ScrapeJobData>): Promise<unknown> {
  const { userId, trigger, fullScan } = job.data;

  try {
    return await runSyncForUser(userId, { trigger, fullScan, jobId: job.id });
  } catch (err) {
    /**
     * Non-retryable failures short-circuit BullMQ's retry policy.
     *
     * An expired X session or a changed selector cannot be fixed by waiting and
     * trying the identical thing again — the retries would just delay the point
     * at which a human sees the problem, and repeated failed logins are exactly
     * what makes X suspicious of an account. `UnrecoverableError` tells BullMQ
     * to fail the job now and keep it visible in the failed set.
     */
    if (err instanceof ScrapeError && !err.retryable) {
      log.error(
        { userId, outcome: err.outcome, reason: err.message, context: err.context },
        'scrape failed permanently — not retrying',
      );
      throw new UnrecoverableError(`${err.outcome}: ${err.message}`);
    }
    throw err;
  }
}

async function processMedia(job: Job<MediaJobData>): Promise<unknown> {
  return archiveMediaForTweet(job.data.bookmarkId);
}

async function main(): Promise<void> {
  await connectDatabase();

  const scrapeWorker = new Worker<ScrapeJobData>(QUEUE_NAMES.scrape, processScrape, {
    connection: createRedisConnection(),
    concurrency: SCRAPE_CONCURRENCY,
    // A stalled scrape is expensive to re-run; give a slow page plenty of room
    // before BullMQ decides the job was abandoned.
    lockDuration: 10 * 60 * 1000,
    stalledInterval: 60_000,
  });

  const mediaWorker = new Worker<MediaJobData>(QUEUE_NAMES.media, processMedia, {
    connection: createRedisConnection(),
    concurrency: MEDIA_CONCURRENCY,
  });

  for (const [name, worker] of [
    ['scrape', scrapeWorker],
    ['media', mediaWorker],
  ] as const) {
    worker.on('completed', (job) => {
      log.info({ queue: name, jobId: job.id }, 'job completed');
    });
    worker.on('failed', (job, err) => {
      // Failures are logged at error level with the attempt count, so a
      // recurring problem is obvious in the logs rather than silent.
      log.error(
        { queue: name, jobId: job?.id, attempts: job?.attemptsMade, reason: err.message },
        'job failed',
      );
    });
    worker.on('error', (err) => {
      log.error({ queue: name, reason: err.message }, 'worker error');
    });
  }

  /**
   * Safety net for media.
   *
   * Media jobs are normally enqueued right after a scrape, but a job can be lost
   * (Redis flushed, worker killed between the Mongo write and the enqueue). This
   * sweep re-queues anything still marked pending/partial/failed under the retry
   * cap, so no bookmark is left with permanently unarchived media because of a
   * transient problem. It is idempotent: the deterministic jobId means an
   * already-queued bookmark is not duplicated.
   */
  const sweep = async () => {
    try {
      const ids = await findTweetsNeedingMedia(MEDIA_SWEEP_BATCH);
      if (ids.length > 0) {
        await enqueueMedia(ids);
        log.info({ count: ids.length }, 'media sweep enqueued outstanding assets');
      }
    } catch (err) {
      log.error({ reason: (err as Error).message }, 'media sweep failed');
    }
  };

  const sweepTimer = setInterval(sweep, MEDIA_SWEEP_INTERVAL_MS);
  sweepTimer.unref();
  void sweep();

  log.info(
    { scrapeConcurrency: SCRAPE_CONCURRENCY, mediaConcurrency: MEDIA_CONCURRENCY, env: env.NODE_ENV },
    'worker started',
  );

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'worker shutting down');
    clearInterval(sweepTimer);
    // `close()` waits for in-flight jobs, so a running scrape finishes and
    // releases its SyncState lock instead of leaving the user stuck "syncing".
    await Promise.all([scrapeWorker.close(), mediaWorker.close()]);
    await closeQueues();
    await closeSharedRedis();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  log.fatal({ reason: (err as Error).message }, 'worker failed to start');
  process.exit(1);
});
