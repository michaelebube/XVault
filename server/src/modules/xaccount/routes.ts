import { Router } from 'express';
import { requireAuth, currentUserId } from '../../middleware/requireAuth.js';
import { disconnectSession, getSessionStatus } from '../../scraper/session.js';
import { removeUserSchedule } from '../../jobs/scheduler.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger('x-account');

const router = Router();
router.use(requireAuth);

/**
 * X account connection state.
 *
 * Note what this endpoint does *not* return: no cookies, no storage state, no
 * ciphertext. `getSessionStatus` reads only the status fields, and the
 * encrypted blob is `select: false` on the model, so there is no code path from
 * here to the credential material (AGENT.md §8).
 *
 * Connecting is deliberately not an HTTP endpoint. Logging into X requires a
 * real, visible browser and often a one-time challenge, so it is an operator
 * action run through `npm run connect-x` on the machine that holds the
 * encryption key — not something the API can do inside a request.
 */
router.get('/', async (req, res) => {
  res.json(await getSessionStatus(currentUserId(req)));
});

router.delete('/', async (req, res) => {
  const userId = currentUserId(req);
  await disconnectSession(userId);
  // The schedule follows the session: a user who disconnected X should not have
  // a scrape waking up every 72 hours to fail.
  await removeUserSchedule(userId).catch((err: unknown) => {
    log.error({ userId, reason: (err as Error).message }, 'failed to remove scrape schedule');
  });
  res.json({ disconnected: true });
});

export { router as xAccountRouter };
