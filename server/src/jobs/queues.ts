import { Queue, type JobsOptions } from 'bullmq';
import { createRedisConnection } from '../lib/redis.js';
import { env } from '../config/env.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('queues');

export const QUEUE_NAMES = {
  scrape: 'xvault-scrape',
  media: 'xvault-media',
  ai: 'xvault-ai',
} as const;

export interface ScrapeJobData {
  userId: string;
  /** 'manual' runs are user-initiated from the UI; 'scheduled' come from the repeat. */
  trigger: 'manual' | 'scheduled';
  /** Ignore incremental stop signals and walk the whole archive. */
  fullScan?: boolean;
}

export interface MediaJobData {
  /** Mongo _id of the Tweet, not the X tweetId. */
  bookmarkId: string;
}

export interface AiJobData {
  userId: string;
  bookmarkId?: string;
}

/**
 * Retry policy.
 *
 * Exponential backoff starting at a minute: the failures we actually expect
 * (X rate-limiting, a flaky network, storage hiccups) all resolve on a
 * timescale of minutes, and hammering X after a failed scrape is exactly the
 * behaviour that gets a session flagged.
 *
 * Note that *non-retryable* failures (expired session, changed selectors) are
 * not handled here — the processor detects them and marks the job failed
 * without consuming retries, because retrying them cannot help.
 */
const scrapeJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 60_000 },
  removeOnComplete: { count: 50 },
  // Keep failures around much longer than successes: a failed sync is something
  // a human needs to be able to look at days later (AGENT.md §11).
  removeOnFail: { count: 200 },
};

const mediaJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 500 },
};

const aiJobOptions: JobsOptions = {
  attempts: 2,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { count: 200 },
  removeOnFail: { count: 200 },
};

let scrapeQueue: Queue<ScrapeJobData> | null = null;
let mediaQueue: Queue<MediaJobData> | null = null;
let aiQueue: Queue<AiJobData> | null = null;

export function getScrapeQueue(): Queue<ScrapeJobData> {
  scrapeQueue ??= new Queue<ScrapeJobData>(QUEUE_NAMES.scrape, {
    connection: createRedisConnection(),
    defaultJobOptions: scrapeJobOptions,
  });
  return scrapeQueue;
}

export function getMediaQueue(): Queue<MediaJobData> {
  mediaQueue ??= new Queue<MediaJobData>(QUEUE_NAMES.media, {
    connection: createRedisConnection(),
    defaultJobOptions: mediaJobOptions,
  });
  return mediaQueue;
}

export function getAiQueue(): Queue<AiJobData> {
  aiQueue ??= new Queue<AiJobData>(QUEUE_NAMES.ai, {
    connection: createRedisConnection(),
    defaultJobOptions: aiJobOptions,
  });
  return aiQueue;
}

/**
 * Custom job ids must not contain `:`.
 *
 * BullMQ uses `:` as its own Redis key separator, and `Job.validateOptions`
 * rejects any custom id containing one unless it splits into exactly three
 * parts — a compatibility carve-out for the internal `repeat:<schedulerId>:<ms>`
 * ids it generates itself. A one-colon id like `scrape-now:<userId>` therefore
 * fails with `Custom Id cannot contain :`, which is why every id below uses `-`.
 *
 * Mongo ObjectIds are 24 hex characters, so `-` cannot collide across these
 * namespaces: a user id can never begin with `now-`, nor a bookmark id with
 * `sweep-`.
 */

/**
 * Per-user scheduler id. One repeatable schedule per user, never a global one.
 *
 * This id is also what BullMQ interpolates into the jobs the schedule produces
 * (`repeat:<schedulerId>:<nextMillis>`), so keeping it colon-free is what makes
 * those generated ids the canonical three-part shape BullMQ expects.
 */
export const scheduleIdFor = (userId: string) => `scrape-${userId}`;

/**
 * Enqueue a scrape now.
 *
 * `jobId` is deterministic per user, which makes BullMQ refuse a second job
 * while one is already waiting or active. That is the *first* of two overlap
 * defences; the second is the `isRunning` flag on SyncState, which also covers
 * the case where a worker died holding the lock. Belt and braces, because two
 * concurrent Playwright sessions on one X account is a good way to get that
 * account rate-limited.
 */
export async function enqueueScrape(
  data: ScrapeJobData,
  options: JobsOptions = {},
): Promise<string | null> {
  const queue = getScrapeQueue();
  const job = await queue.add('scrape', data, {
    jobId: `scrape-now-${data.userId}`,
    ...options,
  });
  log.info({ userId: data.userId, trigger: data.trigger, jobId: job.id }, 'scrape enqueued');
  return job.id ?? null;
}

export async function enqueueMedia(bookmarkIds: string[]): Promise<void> {
  if (bookmarkIds.length === 0) return;
  const queue = getMediaQueue();
  await queue.addBulk(
    bookmarkIds.map((bookmarkId) => ({
      name: 'archive-media',
      data: { bookmarkId },
      // One job per bookmark, deduplicated: re-enqueuing an already-queued
      // bookmark is a no-op instead of a duplicate upload.
      opts: { jobId: `media-${bookmarkId}` },
    })),
  );
}

export async function enqueueAiCategorization(data: AiJobData): Promise<void> {
  const queue = getAiQueue();
  await queue.add('categorize', data, {
    jobId: data.bookmarkId ? `ai-${data.bookmarkId}` : `ai-sweep-${data.userId}`,
  });
}

/**
 * Create or update a user's recurring scrape.
 *
 * `upsertJobScheduler` is idempotent, so calling this on every boot for every
 * connected user is the intended pattern — it reconciles Redis with the
 * database rather than accumulating duplicate schedules.
 *
 * The start time is offset by a per-user amount derived from their id. With a
 * handful of users on one machine, letting every schedule fire at the same
 * instant would mean several Chromium instances at once; spreading them across
 * the window costs nothing and keeps memory flat.
 */
export async function ensureUserSchedule(userId: string): Promise<void> {
  const everyMs = env.SCRAPE_INTERVAL_HOURS * 60 * 60 * 1000;
  const offsetMs = stableOffset(userId, everyMs);

  await getScrapeQueue().upsertJobScheduler(
    scheduleIdFor(userId),
    { every: everyMs, startDate: new Date(Date.now() + offsetMs) },
    {
      name: 'scrape',
      data: { userId, trigger: 'scheduled' } satisfies ScrapeJobData,
      opts: scrapeJobOptions,
    },
  );

  log.info(
    { userId, everyHours: env.SCRAPE_INTERVAL_HOURS, offsetMinutes: Math.round(offsetMs / 60_000) },
    'scrape schedule ensured',
  );
}

export async function removeUserSchedule(userId: string): Promise<void> {
  await getScrapeQueue().removeJobScheduler(scheduleIdFor(userId));
  log.info({ userId }, 'scrape schedule removed');
}

/** Deterministic 0..max offset from a user id, so it does not move across restarts. */
function stableOffset(userId: string, maxMs: number): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  // Spread over the first 10% of the interval — about 7 hours at 72h.
  return hash % Math.max(1, Math.floor(maxMs * 0.1));
}

export async function closeQueues(): Promise<void> {
  await Promise.all([scrapeQueue?.close(), mediaQueue?.close(), aiQueue?.close()]);
  scrapeQueue = null;
  mediaQueue = null;
  aiQueue = null;
}
