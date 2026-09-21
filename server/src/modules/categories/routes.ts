import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { Category } from '../../models/Category.js';
import { Tweet } from '../../models/Tweet.js';
import { requireAuth, currentUserId } from '../../middleware/requireAuth.js';
import { validate, body, params } from '../../middleware/validate.js';
import { badRequest, conflict, notFound } from '../../lib/errors.js';
import { idParams } from '../../lib/validators.js';

const router = Router();
router.use(requireAuth);

const oid = (id: string) => new mongoose.Types.ObjectId(id);

/**
 * Palette tokens rather than free-form colours.
 *
 * DESIGN.md §17 wants categories to stay readable in both themes and to avoid
 * turning the sidebar into a rainbow. Storing a token means the frontend picks
 * the right shade per theme; storing `#ff00ff` would not survive dark mode and
 * would let one bad choice make a category unreadable.
 */
const COLORS = [
  'neutral',
  'indigo',
  'violet',
  'blue',
  'teal',
  'green',
  'amber',
  'orange',
  'rose',
] as const;

const categoryBody = z.object({
  name: z.string().trim().min(1, 'Give the category a name').max(60),
  description: z.string().trim().max(280).optional(),
  color: z.enum(COLORS).optional(),
});

const serialize = (doc: Record<string, any>) => ({
  id: String(doc._id),
  name: doc.name,
  slug: doc.slug,
  description: doc.description ?? '',
  color: doc.color ?? 'neutral',
  createdBy: doc.createdBy ?? 'manual',
  bookmarkCount: doc.bookmarkCount ?? 0,
  createdAt: doc.createdAt,
});

router.get('/', async (req, res) => {
  const userId = currentUserId(req);
  const categories = await Category.find({ userId: oid(userId) })
    .sort({ name: 1 })
    .lean();

  // The uncategorized count sits alongside the list because the sidebar needs
  // it as a first-class destination, not as an afterthought.
  const uncategorizedCount = await Tweet.countDocuments({
    userId: oid(userId),
    categoryId: null,
  });

  res.json({ categories: categories.map(serialize), uncategorizedCount });
});

router.post('/', validate({ body: categoryBody }), async (req, res) => {
  const userId = currentUserId(req);
  const input = body<z.infer<typeof categoryBody>>(req);

  try {
    const category = await Category.create({
      userId: oid(userId),
      name: input.name,
      slug: input.name.toLowerCase(),
      description: input.description ?? '',
      color: input.color ?? 'neutral',
      createdBy: 'manual',
    });
    res.status(201).json({ category: serialize(category.toObject()) });
  } catch (err) {
    // The unique index on (userId, slug) is what actually enforces this; the
    // duplicate-key error is translated rather than pre-checked, so two
    // simultaneous creates cannot both pass a check and both insert.
    if ((err as { code?: number }).code === 11000) {
      throw conflict('You already have a category with that name');
    }
    throw err;
  }
});

router.patch(
  '/:id',
  validate({ params: idParams, body: categoryBody.partial() }),
  async (req, res) => {
    const userId = currentUserId(req);
    const { id } = params<{ id: string }>(req);
    const input = body<Partial<z.infer<typeof categoryBody>>>(req);

    const update: Record<string, unknown> = {};
    if (input.name !== undefined) {
      update.name = input.name;
      update.slug = input.name.toLowerCase();
    }
    if (input.description !== undefined) update.description = input.description;
    if (input.color !== undefined) update.color = input.color;

    if (Object.keys(update).length === 0) throw badRequest('Nothing to update');

    try {
      const category = await Category.findOneAndUpdate(
        { _id: id, userId: oid(userId) },
        { $set: update },
        { new: true },
      ).lean();
      if (!category) throw notFound('That category does not exist in your library');
      res.json({ category: serialize(category) });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        throw conflict('You already have a category with that name');
      }
      throw err;
    }
  },
);

/**
 * Delete a category.
 *
 * Bookmarks are never deleted with it — they fall back to uncategorized. This
 * is an archive: removing an organisational label must not remove the thing
 * being organised.
 */
router.delete('/:id', validate({ params: idParams }), async (req, res) => {
  const userId = currentUserId(req);
  const { id } = params<{ id: string }>(req);

  const category = await Category.findOneAndDelete({ _id: id, userId: oid(userId) }).lean();
  if (!category) throw notFound('That category does not exist in your library');

  const { modifiedCount } = await Tweet.updateMany(
    { userId: oid(userId), categoryId: oid(id) },
    { $set: { categoryId: null, categorizationSource: 'uncategorized' } },
  );

  res.json({ deleted: true, bookmarksUncategorized: modifiedCount });
});

export { router as categoriesRouter };
