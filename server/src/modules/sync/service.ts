import { SyncState } from '../../models/SyncState.js';
import { XSession } from '../../models/XSession.js';
import { Tweet } from '../../models/Tweet.js';
import type { SyncOutcome } from '../../models/types.js';
import { childLogger } from '../../lib/logger.js';
import { env } from '../../config/env.js';
import { conflict, badRequest } from '../../lib/errors.js';
import { scrapeUserBookmarks } from '../../scraper/bookmarkScraper.js';
import { ScrapeError } from '../../scraper/errors.js';
import { markSessionInvalid } from '../../scraper/session.js';
import { archiveScrapedBookmarks, getArchivedTweetIds } from '../bookmarks/service.js';
import { enqueueAiCategorization, enqueueMedia, enqueueScrape } from '../../jobs/queues.js';
import { aiConfigured } from '../../config/env.js';

const log = childLogger('sync');

/**
 * A run that started longer ago than this is assumed dead (the worker crashed
 * or was killed mid-scrape) and its lock can be taken over. Comfortably longer
 * than a realistic full backfill, so a slow run is never stolen from.
 */
export const STALE_LOCK_MS = 45 * 60 * 1000;

export interface SyncRunResult {
  outcome: SyncOutcome;
  newCount: number;
  seenCount: number;
  stoppedBecause: string;
}

/**
 * Run one sync for one user.
 *
 * The lock is a `findOneAndUpdate` on SyncState rather than a Redis lock.
 * MongoDB is already the authority for this user's sync state, and a single
 * atomic document update gives mutual exclusion without a second system to
 * reason about. The `$or` on a stale `runStartedAt` is what stops a crashed
 * worker from locking a user out forever.
 */
export async function runSyncForUser(
  userId: string,
  options: { trigger: 'manual' | 'scheduled'; fullScan?: boolean; jobId?: string },
): Promise<SyncRunResult> {
  const runLog = log.child({ userId, trigger: options.trigger });
  const now = new Date();

  const state = await SyncState.findOneAndUpdate(
    {
      userId,
      $or: [
        { isRunning: false },
        { isRunning: { $exists: false } },
        { runStartedAt: { $lt: new Date(now.getTime() - STALE_LOCK_MS) } },
      ],
    },
    {
      $set: { isRunning: true, runStartedAt: now, currentJobId: options.jobId ?? null },
      $setOnInsert: { userId },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).catch((err: unknown) => {
    // Upsert raced with a concurrent upsert on the unique userId index: someone
    // else is already running. Treated the same as failing to take the lock.
    if ((err as { code?: number }).code === 11000) return null;
    throw err;
  });

  if (!state) {
    throw conflict('A sync is already running for this account');
  }

  try {
    const knownTweetIds = await getArchivedTweetIds(userId);
    // A full scan is forced on the very first run: with no archive to compare
    // against, the incremental stop signals would be meaningless anyway, and we
    // want the complete backfill before switching to cheap 72-hour deltas.
    const fullScan = options.fullScan ?? !state.initialBackfillComplete;

    const result = await scrapeUserBookmarks({
      userId,
      knownTweetIds,
      newestTweetId: state.newestTweetId ?? null,
      fullScan,
    });

    const archive = await archiveScrapedBookmarks(userId, result.bookmarks);

    // Media is archived by a separate queue, deliberately: see
    // modules/media/service.ts. The scrape is already a success at this point.
    await enqueueMedia(archive.insertedIds);

    if (aiConfigured && archive.insertedCount > 0) {
      await enqueueAiCategorization({ userId });
    }

    const outcome: SyncOutcome = archive.insertedCount > 0 ? 'ok_new' : 'ok_no_new';
    const totalArchived = await Tweet.countDocuments({ userId });

    await SyncState.updateOne(
      { userId },
      {
        $set: {
          isRunning: false,
          runStartedAt: null,
          currentJobId: null,
          lastRunAt: new Date(),
          lastSuccessfulSyncAt: new Date(),
          lastOutcome: outcome,
          lastErrorMessage: null,
          consecutiveFailures: 0,
          // Only a walk that actually reached the end of the timeline proves the
          // backfill is complete. Stopping early for any other reason leaves it
          // false so the next run keeps scanning fully.
          ...(result.stoppedBecause === 'end_of_timeline' || !fullScan
            ? { initialBackfillComplete: true }
            : {}),
          ...(result.topTweetId ? { newestTweetId: result.topTweetId } : {}),
          'stats.lastRunNewCount': archive.insertedCount,
          'stats.lastRunSeenCount': result.seenCount,
          'stats.totalArchived': totalArchived,
        },
        $inc: { 'stats.totalRuns': 1 },
      },
    );

    await XSession.updateOne(
      { userId },
      { $set: { status: 'active', lastValidatedAt: new Date(), invalidatedAt: null } },
    );

    runLog.info(
      {
        outcome,
        new: archive.insertedCount,
        seen: result.seenCount,
        stoppedBecause: result.stoppedBecause,
        emptyArchive: result.emptyArchive,
      },
      outcome === 'ok_new'
        ? 'sync completed with new bookmarks'
        : 'sync completed with no new bookmarks',
    );

    return {
      outcome,
      newCount: archive.insertedCount,
      seenCount: result.seenCount,
      stoppedBecause: result.stoppedBecause,
    };
  } catch (err) {
    const outcome = classifyFailure(err);
    const message = (err as Error).message ?? 'Unknown error';

    if (outcome === 'auth_failed') {
      // The session is the problem, so say so on the session itself. This is
      // what drives the "Reconnect X" state in the UI rather than a generic
      // sync error (DESIGN.md §25).
      await markSessionInvalid(userId);
    }

    await SyncState.updateOne(
      { userId },
      {
        $set: {
          isRunning: false,
          runStartedAt: null,
          currentJobId: null,
          lastRunAt: new Date(),
          lastOutcome: outcome,
          lastErrorMessage: message.slice(0, 600),
        },
        $inc: { consecutiveFailures: 1, 'stats.totalRuns': 1 },
      },
    );

    // error level, with the classification attached: AGENT.md §11 requires
    // failures to be loud and distinguishable, never swallowed.
    runLog.error({ outcome, reason: message }, 'sync failed');
    throw err;
  }
}

function classifyFailure(err: unknown): SyncOutcome {
  if (err instanceof ScrapeError) return err.outcome;
  const name = (err as Error)?.name ?? '';
  if (name === 'MongoServerError' || name === 'MongooseError' || name === 'ValidationError') {
    return 'database_failed';
  }
  return 'unknown_failed';
}

/** Release a lock without recording an outcome — used when a job is discarded. */
export async function releaseLock(userId: string): Promise<void> {
  await SyncState.updateOne(
    { userId },
    { $set: { isRunning: false, runStartedAt: null, currentJobId: null } },
  );
}

/**
 * Queue a user-initiated sync.
 *
 * The HTTP layer deliberately only *enqueues*: a scrape opens Chromium and can
 * run for minutes, which must not happen inside an Express request (AGENT.md
 * §9). The two pre-checks here exist to give the UI an immediate, honest answer
 * instead of accepting a job that is guaranteed to fail or to be a no-op:
 *
 *   - no X session -> 400 with the "connect X" story, not a failed job
 *   - already running -> 409, so the button does not silently do nothing
 *
 * Overlap is still prevented twice more (deterministic BullMQ jobId, and the
 * SyncState lock in `runSyncForUser`); this check is for the human, not for
 * correctness.
 */
export async function requestSync(
  userId: string,
  options: { fullScan?: boolean } = {},
): Promise<{ jobId: string | null }> {
  const session = await XSession.findOne({ userId }).select('status').lean();
  if (!session) {
    throw badRequest('Connect your X account before syncing');
  }
  if (session.status === 'invalid') {
    throw badRequest('Your X session is no longer valid — reconnect X to sync again');
  }

  const state = await SyncState.findOne({ userId }).select('isRunning runStartedAt').lean();
  const runningFresh =
    state?.isRunning &&
    state.runStartedAt &&
    state.runStartedAt.getTime() > Date.now() - STALE_LOCK_MS;
  if (runningFresh) {
    throw conflict('A sync is already running for this account');
  }

  const jobId = await enqueueScrape({
    userId,
    trigger: 'manual',
    ...(options.fullScan ? { fullScan: true } : {}),
  });

  return { jobId };
}

// ---------------------------------------------------------------------------
// Status for the frontend
// ---------------------------------------------------------------------------

export type SyncHealth = 'never_run' | 'healthy' | 'needs_attention' | 'syncing' | 'not_connected';

/**
 * Everything the UI needs to describe sync health — and nothing else.
 *
 * `lastErrorMessage` is included but explicitly labelled as the technical
 * detail: DESIGN.md §23 wants a calm human summary by default with the raw
 * detail tucked into an advanced view, so the API returns both and lets the UI
 * decide.
 */
export async function getSyncStatus(userId: string) {
  const [state, session] = await Promise.all([
    SyncState.findOne({ userId }).lean(),
    XSession.findOne({ userId }).select('status xHandle connectedAt lastValidatedAt').lean(),
  ]);

  const connected = session?.status === 'active' || session?.status === 'unverified';

  let health: SyncHealth;
  if (!connected) health = 'not_connected';
  else if (state?.isRunning) health = 'syncing';
  else if (!state?.lastRunAt) health = 'never_run';
  else if (session?.status !== 'active' || (state.consecutiveFailures ?? 0) > 0) {
    health = 'needs_attention';
  } else health = 'healthy';

  const nextSyncAt =
    state?.lastSuccessfulSyncAt && connected
      ? new Date(
          state.lastSuccessfulSyncAt.getTime() + env.SCRAPE_INTERVAL_HOURS * 60 * 60 * 1000,
        )
      : null;

  return {
    health,
    connected,
    xHandle: session?.xHandle ?? null,
    sessionStatus: session?.status ?? 'disconnected',
    isRunning: Boolean(state?.isRunning),
    lastRunAt: state?.lastRunAt ?? null,
    lastSuccessfulSyncAt: state?.lastSuccessfulSyncAt ?? null,
    lastOutcome: state?.lastOutcome ?? null,
    consecutiveFailures: state?.consecutiveFailures ?? 0,
    initialBackfillComplete: Boolean(state?.initialBackfillComplete),
    nextSyncAt,
    intervalHours: env.SCRAPE_INTERVAL_HOURS,
    stats: {
      lastRunNewCount: state?.stats?.lastRunNewCount ?? 0,
      lastRunSeenCount: state?.stats?.lastRunSeenCount ?? 0,
      totalRuns: state?.stats?.totalRuns ?? 0,
      totalArchived: state?.stats?.totalArchived ?? 0,
    },
    /** Operator detail. The UI keeps this behind an "advanced" disclosure. */
    lastErrorMessage: state?.lastErrorMessage ?? null,
  };
}
