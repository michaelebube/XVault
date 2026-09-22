import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Tweet } from '../../models/Tweet.js';
import { requireAuth, currentUserId } from '../../middleware/requireAuth.js';
import { validate, body, params, query } from '../../middleware/validate.js';
import { booleanish, idParams, objectId } from '../../lib/validators.js';
import {
  acceptSuggestion,
  deleteBookmark,
  getBookmark,
  listBookmarks,
  rejectSuggestion,
  setBookmarkCategory,
  updateNotes,
  type ListFilters,
} from './service.js';

const router = Router();
router.use(requireAuth);

const oid = (id: string) => new mongoose.Types.ObjectId(id);

/**
 * Every filter arrives as a string on the query string, so the schema coerces
 * rather than trusts. Two details worth noting:
 *
 *   - `limit` is capped at 100. Without a cap, `?limit=100000` is a trivial way
 *     to make the server serialise an entire archive into one response.
 *   - `categoryId` accepts the literal `'none'` alongside an id, because
 *     "uncategorized" is a real destination in the UI (DESIGN.md §17), not the
 *     absence of a filter.
 */
const listQuery = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  categoryId: z.union([objectId, z.literal('none')]).optional(),
  author: z.string().trim().min(1).max(40).optional(),
  hasMedia: booleanish.optional(),
  hasLinks: booleanish.optional(),
  source: z.enum(['manual', 'ai', 'uncategorized']).optional(),
  pendingSuggestion: booleanish.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.enum(['newest', 'oldest', 'tweet_newest', 'tweet_oldest']).default('newest'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

router.get('/', validate({ query: listQuery }), async (req, res) => {
  const filters = query<ListFilters>(req);
  res.json(await listBookmarks({ userId: currentUserId(req) }, filters));
});

/**
 * Distinct authors for the filter UI.
 *
 * Declared before `/:id` on purpose: Express matches in order, and `idParams`
 * would otherwise reject "authors" as a malformed id.
 */
router.get('/authors', async (req, res) => {
  const authors = await Tweet.aggregate<{ _id: string; name: string; count: number }>([
    { $match: { userId: oid(currentUserId(req)) } },
    {
      $group: {
        _id: '$author.handle',
        name: { $first: '$author.name' },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1, _id: 1 } },
    { $limit: 200 },
  ]);

  res.json({
    authors: authors.map((a) => ({ handle: a._id, name: a.name ?? a._id, count: a.count })),
  });
});

router.get('/:id', validate({ params: idParams }), async (req, res) => {
  const { id } = params<{ id: string }>(req);
  res.json({ bookmark: await getBookmark({ userId: currentUserId(req) }, id) });
});

/**
 * Manual categorisation.
 *
 * `null` clears the category rather than being a separate endpoint, because
 * "move to uncategorized" is the same user action as "move to another category"
 * and should take the same code path — including the `humanEditedAt` stamp that
 * protects the choice from the AI worker (AGENT.md §17).
 */
router.patch(
  '/:id/category',
  validate({ params: idParams, body: z.object({ categoryId: objectId.nullable() }) }),
  async (req, res) => {
    const { id } = params<{ id: string }>(req);
    const { categoryId } = body<{ categoryId: string | null }>(req);
    res.json({
      bookmark: await setBookmarkCategory({ userId: currentUserId(req) }, id, categoryId),
    });
  },
);

router.post('/:id/suggestion/accept', validate({ params: idParams }), async (req, res) => {
  const { id } = params<{ id: string }>(req);
  res.json({ bookmark: await acceptSuggestion({ userId: currentUserId(req) }, id) });
});

router.post('/:id/suggestion/reject', validate({ params: idParams }), async (req, res) => {
  const { id } = params<{ id: string }>(req);
  res.json({ bookmark: await rejectSuggestion({ userId: currentUserId(req) }, id) });
});

router.patch(
  '/:id/notes',
  validate({ params: idParams, body: z.object({ notes: z.string().max(4000) }) }),
  async (req, res) => {
    const { id } = params<{ id: string }>(req);
    const { notes } = body<{ notes: string }>(req);
    res.json({ bookmark: await updateNotes({ userId: currentUserId(req) }, id, notes) });
  },
);

router.delete('/:id', validate({ params: idParams }), async (req, res) => {
  const { id } = params<{ id: string }>(req);
  await deleteBookmark({ userId: currentUserId(req) }, id);
  res.json({ deleted: true });
});

export { router as bookmarksRouter };
