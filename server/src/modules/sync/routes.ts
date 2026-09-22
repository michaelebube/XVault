import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, currentUserId } from '../../middleware/requireAuth.js';
import { validate, body } from '../../middleware/validate.js';
import { getSyncStatus, requestSync } from './service.js';

const router = Router();
router.use(requireAuth);

router.get('/status', async (req, res) => {
  res.json(await getSyncStatus(currentUserId(req)));
});

/**
 * Manual sync trigger.
 *
 * Responds 202 rather than 200: the work has been accepted, not done. The UI
 * then polls `/status`, which is the same state the scheduled runs report, so
 * there is one description of sync health rather than two.
 */
router.post(
  '/run',
  validate({ body: z.object({ fullScan: z.boolean().optional() }).default({}) }),
  async (req, res) => {
    const { fullScan } = body<{ fullScan?: boolean }>(req);
    const result = await requestSync(currentUserId(req), { fullScan: fullScan ?? false });
    res.status(202).json({ queued: true, ...result });
  },
);

export { router as syncRouter };
