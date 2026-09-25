import { connectDatabase, disconnectDatabase } from '../lib/db.js';
import { User } from '../models/User.js';
import { SyncState } from '../models/SyncState.js';
import { releaseLock, STALE_LOCK_MS } from '../modules/sync/service.js';
import { closeQueues, getScrapeQueue } from '../jobs/queues.js';

/**
 * Operator recovery for a stuck SyncState lock.
 *
 * **Why this exists.** A scrape holds `SyncState.isRunning` for the duration of
 * the run, and releases it in the success and failure paths. If the process is
 * killed outright (Ctrl-C twice, `tsx watch` restart, OOM mid-scrape) neither
 * path runs and the flag stays true. Every later run — scheduled or manual — is
 * then rejected with "A sync is already running for this account", and the UI
 * sits on "Syncing" forever.
 *
 * `runSyncForUser` already takes over a lock whose `runStartedAt` is older than
 * `STALE_LOCK_MS`, so a stale lock usually self-heals. This script is for the
 * two cases that do not: the operator does not want to wait out the window, or
 * `runStartedAt` was left null, which the takeover `$or` does not match (MongoDB
 * does not compare null against a Date).
 *
 * It reuses the existing `releaseLock()`, so it clears the same three fields the
 * service does: `isRunning`, `runStartedAt`, `currentJobId`. Nothing else on the
 * document — incremental cursor, stats, failure counts, outcome — is touched,
 * and no bookmark, X session or user is modified.
 *
 * Usage:
 *   npm run reset-sync --workspace server -- --email you@example.com --dry-run
 *   npm run reset-sync --workspace server -- --email you@example.com
 *   npm run reset-sync --workspace server                       # every user
 */

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const hasFlag = (name: string) => process.argv.includes(`--${name}`);

interface StateView {
  isRunning?: boolean;
  runStartedAt?: Date | null;
  currentJobId?: string | null;
  lastRunAt?: Date | null;
  lastOutcome?: string | null;
  consecutiveFailures?: number;
}

function describe(label: string, state: StateView | null): void {
  if (!state) {
    process.stdout.write(`${label}: no SyncState document\n`);
    return;
  }
  process.stdout.write(
    `${label}: isRunning=${String(state.isRunning)} ` +
      `runStartedAt=${state.runStartedAt?.toISOString() ?? 'null'} ` +
      `currentJobId=${state.currentJobId ?? 'null'} ` +
      `lastRunAt=${state.lastRunAt?.toISOString() ?? 'null'} ` +
      `lastOutcome=${state.lastOutcome ?? 'null'} ` +
      `consecutiveFailures=${state.consecutiveFailures ?? 0}\n`,
  );
}

async function main(): Promise<void> {
  const email = arg('email')?.toLowerCase();
  const dryRun = hasFlag('dry-run');
  const force = hasFlag('force');

  await connectDatabase();

  const users = email
    ? await User.find({ email }).select('email').lean()
    : await User.find().select('email').lean();

  if (users.length === 0) {
    throw new Error(email ? `No user with email ${email}` : 'No users found');
  }

  const queue = getScrapeQueue();
  // `createRedisConnection` hands BullMQ an instance it does not own, so
  // `queue.close()` leaves the socket open and the process would hang after the
  // work is done. Keep a handle and quit it explicitly at the end.
  const queueConnection = await queue.client;

  for (const user of users) {
    const userId = String(user._id);
    const before = await SyncState.findOne({ userId }).lean();

    process.stdout.write(`\nuser ${user.email} (${userId})\n`);
    describe('  before', before);

    if (!before?.isRunning) {
      process.stdout.write('  nothing to do: lock is not held\n');
      continue;
    }

    const startedAt = before.runStartedAt ?? null;
    const heldFor = startedAt ? Date.now() - startedAt.getTime() : null;

    // A lock younger than the takeover window may belong to a run that is
    // genuinely in flight — clearing it would allow two Chromium sessions on
    // one X account. Refuse unless the operator says otherwise.
    if (heldFor !== null && heldFor < STALE_LOCK_MS && !force) {
      process.stdout.write(
        `  refusing: lock taken ${Math.round(heldFor / 1000)}s ago, still inside the ` +
          `${STALE_LOCK_MS / 60_000}-minute stale window. Re-run with --force if the worker is ` +
          `definitely not running.\n`,
      );
      continue;
    }

    if (startedAt === null) {
      process.stdout.write(
        '  note: runStartedAt is null, so the automatic stale-lock takeover cannot match this ' +
          'document — it would stay locked indefinitely.\n',
      );
    }

    if (dryRun) {
      process.stdout.write('  dry run: would release the lock\n');
      continue;
    }

    await releaseLock(userId);

    // The manual-sync job id is deterministic (`scrape-now-<userId>`), so a
    // failed or delayed job still sitting in Redis under that id would swallow
    // the next "Sync now" as a duplicate. Remove it so the next attempt is a
    // genuinely new job.
    const removedJob = await queue.remove(`scrape-now-${userId}`);
    process.stdout.write(`  removed stale scrape job: ${removedJob}\n`);

    describe('  after ', await SyncState.findOne({ userId }).lean());
  }

  await closeQueues();
  await queueConnection.quit().catch(() => undefined);
  await disconnectDatabase();
}

main().catch((err: unknown) => {
  process.stderr.write(`${(err as Error).message}\n`);
  process.exit(1);
});
