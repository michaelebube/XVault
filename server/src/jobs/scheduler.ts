import { XSession } from '../models/XSession.js';
import { childLogger } from '../lib/logger.js';
import { ensureUserSchedule, getScrapeQueue, removeUserSchedule, scheduleIdFor } from './queues.js';

const log = childLogger('scheduler');

/**
 * Reconcile Redis job schedulers with the database on boot.
 *
 * MongoDB is the source of truth for "who should be scraped": anyone with a
 * connected X session. Redis holds the schedules. Rather than trying to keep
 * the two in lockstep through every code path, we simply reconcile at startup —
 * add what is missing, remove what should not be there.
 *
 * This is what makes the system recoverable. If Redis is flushed, or a schedule
 * is deleted by hand, or the app crashes between creating a session and
 * creating its schedule, the next boot repairs it. Schedules are never the
 * authoritative record of anything.
 */
export async function ensureAllSchedules(): Promise<void> {
  try {
    const sessions = await XSession.find({ status: { $in: ['active', 'unverified'] } })
      .select('userId')
      .lean();

    const shouldHaveSchedule = new Set(sessions.map((s) => String(s.userId)));

    for (const userId of shouldHaveSchedule) {
      await ensureUserSchedule(userId);
    }

    // Drop schedules belonging to users who disconnected X (or were deleted).
    const existing = await getScrapeQueue().getJobSchedulers(0, 1000);
    const expected = new Set([...shouldHaveSchedule].map(scheduleIdFor));

    for (const scheduler of existing) {
      if (scheduler.key && !expected.has(scheduler.key)) {
        await getScrapeQueue().removeJobScheduler(scheduler.key);
        log.info({ key: scheduler.key }, 'removed orphaned scrape schedule');
      }
    }

    log.info({ users: shouldHaveSchedule.size }, 'scrape schedules reconciled');
  } catch (err) {
    // A scheduling problem must not stop the API from serving requests. The
    // archive is still browsable; only future automatic syncs are affected, and
    // the next boot will try again.
    log.error({ err: (err as Error).message }, 'failed to reconcile scrape schedules');
  }
}

export { ensureUserSchedule, removeUserSchedule };
