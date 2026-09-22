import mongoose, { type FilterQuery } from 'mongoose';
import { Tweet, type TweetDoc } from '../../models/Tweet.js';
import { Category } from '../../models/Category.js';
import type { CategorizationSource, MediaStatus } from '../../models/types.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { childLogger } from '../../lib/logger.js';
import { presignGet } from '../media/r2.js';
import type { RawBookmark } from '../../browser/extract.js';

const log = childLogger('bookmarks');

const oid = (id: string) => new mongoose.Types.ObjectId(id);

/** Everything a caller must prove it owns before a query is built. */
export interface OwnerScope {
  userId: string;
}

// ---------------------------------------------------------------------------
// Archival
// ---------------------------------------------------------------------------

export interface ArchiveResult {
  insertedIds: string[];
  insertedCount: number;
  alreadyArchivedCount: number;
}

/**
 * The plain-object shape this module *inserts*, which is not `TweetAttrs`.
 *
 * `InferSchemaType` describes a hydrated document: its subdocument arrays are
 * `Types.DocumentArray`, and every field with a schema default is required. An
 * insert is the opposite — plain arrays, and only the fields the scraper
 * actually knows, with the schema filling in the rest. Describing that shape
 * explicitly and passing it as `bulkWrite`'s type argument keeps the operations
 * fully type-checked instead of cast, and doubles as documentation of exactly
 * what a scrape writes.
 */
interface TweetInsert {
  userId: mongoose.Types.ObjectId;
  tweetId: string;
  originalUrl: string;
  text: string;
  author: { name: string; handle: string; avatarSourceUrl: string | null };
  media: Array<{
    kind: 'image' | 'video' | 'gif';
    sourceUrl: string;
    posterSourceUrl?: string | null;
    altText?: string;
    status: 'pending';
  }>;
  links: Array<{ url: string; displayUrl: string }>;
  tweetCreatedAt: Date | null;
  archivedAt: Date;
  bookmarkRank: number;
  categoryId: mongoose.Types.ObjectId | null;
  categorizationSource: CategorizationSource;
  mediaStatus: MediaStatus;
}


/**
 * Persist scraped bookmarks for one user.
 *
 * Idempotency comes from the unique index on (userId, tweetId) plus `upsert`
 * with **$setOnInsert only**: re-encountering a tweet writes nothing at all.
 *
 * That is a deliberate archival choice, not laziness. Two consequences worth
 * being explicit about:
 *   - A user's category, notes and AI suggestion can never be clobbered by a
 *     later scrape. The scraper cannot undo human work.
 *   - If the tweet is edited on X afterwards, we keep what we archived. For an
 *     archive, "what I saved" is more correct than "what it says now".
 *
 * `bulkWrite` with `ordered: false` sends all of them in one round trip and
 * keeps going past individual duplicate-key errors, which is exactly what we
 * want when two runs overlap.
 */
export async function archiveScrapedBookmarks(
  userId: string,
  bookmarks: RawBookmark[],
): Promise<ArchiveResult> {
  if (bookmarks.length === 0) {
    return { insertedIds: [], insertedCount: 0, alreadyArchivedCount: 0 };
  }

  const now = new Date();

  const operations = bookmarks.map((b, index) => {
    const media: TweetInsert['media'] = [
      ...b.images.map((img) => ({
        kind: 'image' as const,
        sourceUrl: img.url,
        altText: img.altText,
        status: 'pending' as const,
      })),
      ...b.videos
        // A video with neither a poster nor a direct source gives us nothing to
        // archive; recording it as media would produce a permanently broken item.
        .filter((v) => v.posterUrl || v.sourceUrl)
        .map((v) => ({
          kind: v.isGif ? ('gif' as const) : ('video' as const),
          sourceUrl: v.sourceUrl ?? v.posterUrl!,
          posterSourceUrl: v.posterUrl,
          status: 'pending' as const,
        })),
    ];

    /**
     * Annotated rather than inferred on purpose. Without the `TweetInsert`
     * annotation, `categorizationSource: 'uncategorized'` widens to `string`
     * inside an object literal that nothing contextually types, and `bulkWrite`
     * then rejects the whole operation list. Naming the type here keeps the
     * literals narrow and type-checks the payload against the schema shape,
     * which a cast would not do.
     */
    const doc: TweetInsert = {
      userId: oid(userId),
      tweetId: b.tweetId,
      originalUrl: b.originalUrl,
      text: b.text,
      author: {
        name: b.authorName,
        handle: b.authorHandle,
        avatarSourceUrl: b.authorAvatarUrl,
      },
      media,
      links: b.links,
      tweetCreatedAt: b.tweetCreatedAt ? new Date(b.tweetCreatedAt) : null,
      archivedAt: now,
      bookmarkRank: index,
      categoryId: null,
      categorizationSource: 'uncategorized',
      mediaStatus: media.length === 0 ? 'none' : 'pending',
    };

    return {
      updateOne: {
        filter: { userId: oid(userId), tweetId: b.tweetId },
        update: { $setOnInsert: doc },
        upsert: true,
      },
    };
  });

  const result = await Tweet.bulkWrite<TweetInsert>(operations, { ordered: false });

  const insertedIds = Object.values(result.upsertedIds ?? {}).map(String);
  const insertedCount = insertedIds.length;

  log.info(
    { userId, scanned: bookmarks.length, inserted: insertedCount },
    'archived scraped bookmarks',
  );

  return {
    insertedIds,
    insertedCount,
    alreadyArchivedCount: bookmarks.length - insertedCount,
  };
}

/** Every tweetId this user already has. Feeds the scraper's incremental stop. */
export async function getArchivedTweetIds(userId: string): Promise<Set<string>> {
  const ids = await Tweet.find({ userId: oid(userId) }).distinct('tweetId');
  return new Set(ids as string[]);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface ListFilters {
  q?: string;
  /** A category id, or the literal 'none' for uncategorized. */
  categoryId?: string;
  author?: string;
  hasMedia?: boolean;
  hasLinks?: boolean;
  source?: 'manual' | 'ai' | 'uncategorized';
  /** Only bookmarks with an AI suggestion awaiting a decision. */
  pendingSuggestion?: boolean;
  from?: Date;
  to?: Date;
  sort?: 'newest' | 'oldest' | 'tweet_newest' | 'tweet_oldest';
  page: number;
  limit: number;
}

/**
 * Builds the Mongo filter for a list query.
 *
 * `userId` is applied here and nowhere else, so there is exactly one place to
 * audit for the isolation requirement in AGENT.md §7. Callers cannot construct a
 * bookmark query that omits it.
 */
function buildFilter(userId: string, f: ListFilters): FilterQuery<TweetDoc> {
  const filter: FilterQuery<TweetDoc> = { userId: oid(userId) };

  if (f.q) filter.$text = { $search: f.q };

  if (f.categoryId === 'none') filter.categoryId = null;
  else if (f.categoryId) filter.categoryId = oid(f.categoryId);

  if (f.author) filter['author.handle'] = new RegExp(`^${escapeRegex(f.author)}$`, 'i');
  if (f.hasMedia !== undefined) {
    filter.media = f.hasMedia ? { $ne: [] } : { $size: 0 };
  }
  if (f.hasLinks !== undefined) {
    filter.links = f.hasLinks ? { $ne: [] } : { $size: 0 };
  }
  if (f.source) filter.categorizationSource = f.source;
  if (f.pendingSuggestion) {
    filter['aiSuggestion.status'] = 'pending';
    filter.categoryId = null;
  }
  if (f.from || f.to) {
    filter.archivedAt = {
      ...(f.from ? { $gte: f.from } : {}),
      ...(f.to ? { $lte: f.to } : {}),
    };
  }

  return filter;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSort(f: ListFilters): Record<string, 1 | -1 | { $meta: 'textScore' }> {
  // With a text search, relevance first is what a user expects; recency breaks ties.
  if (f.q) return { score: { $meta: 'textScore' }, archivedAt: -1 };

  switch (f.sort) {
    case 'oldest':
      return { archivedAt: 1, bookmarkRank: -1 };
    case 'tweet_newest':
      return { tweetCreatedAt: -1 };
    case 'tweet_oldest':
      return { tweetCreatedAt: 1 };
    default:
      // Matches the { userId, archivedAt: -1, bookmarkRank: 1 } index exactly.
      return { archivedAt: -1, bookmarkRank: 1 };
  }
}

export async function listBookmarks(scope: OwnerScope, f: ListFilters) {
  const filter = buildFilter(scope.userId, f);
  const skip = (f.page - 1) * f.limit;

  /**
   * Offset pagination rather than a cursor. For a personal archive (thousands,
   * not millions, of bookmarks) the skip is cheap and the index covers the sort.
   * The cost is the usual one: if new bookmarks arrive mid-browse, items can
   * shift between pages. Worth revisiting only if an archive gets very large.
   */
  const query = Tweet.find(filter)
    .sort(buildSort(f))
    .skip(skip)
    .limit(f.limit)
    .populate('categoryId', 'name slug color')
    .lean();

  if (f.q) query.select({ score: { $meta: 'textScore' } });

  const [items, total] = await Promise.all([query.exec(), Tweet.countDocuments(filter)]);

  return {
    // Serialisation is async because each media URL is presigned.
    items: await Promise.all(items.map(serializeBookmark)),
    page: f.page,
    limit: f.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / f.limit)),
  };
}

export async function getBookmark(scope: OwnerScope, id: string) {
  const doc = await Tweet.findOne({ _id: id, userId: oid(scope.userId) })
    .populate('categoryId', 'name slug color')
    .lean();
  if (!doc) throw notFound('That bookmark is not in your archive');
  return serializeBookmark(doc);
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Assign (or clear) a category by hand.
 *
 * Setting `humanEditedAt` is what protects the choice: the AI worker refuses to
 * re-suggest for a bookmark a human touched recently (AGENT.md §17). Any pending
 * suggestion is resolved at the same time, so the UI never shows a suggestion
 * next to a category the user already chose.
 */
export async function setBookmarkCategory(
  scope: OwnerScope,
  bookmarkId: string,
  categoryId: string | null,
) {
  if (categoryId) {
    // Ownership check on the category too: a user must not be able to file their
    // bookmark under someone else's category id.
    const category = await Category.findOne({
      _id: categoryId,
      userId: oid(scope.userId),
    }).lean();
    if (!category) throw badRequest('That category does not exist in your library');
  }

  const before = await Tweet.findOne({ _id: bookmarkId, userId: oid(scope.userId) }).lean();
  if (!before) throw notFound('That bookmark is not in your archive');

  const updated = await Tweet.findOneAndUpdate(
    { _id: bookmarkId, userId: oid(scope.userId) },
    {
      $set: {
        categoryId: categoryId ? oid(categoryId) : null,
        categorizationSource: categoryId ? 'manual' : 'uncategorized',
        humanEditedAt: new Date(),
        ...(before.aiSuggestion
          ? { 'aiSuggestion.status': categoryId ? 'accepted' : 'rejected' }
          : {}),
      },
    },
    { new: true },
  )
    .populate('categoryId', 'name slug color')
    .lean();

  await syncCategoryCounts(scope.userId, [
    before.categoryId ? String(before.categoryId) : null,
    categoryId,
  ]);

  return serializeBookmark(updated!);
}

/** Accept the AI's suggestion, creating the proposed category if needed. */
export async function acceptSuggestion(scope: OwnerScope, bookmarkId: string) {
  const doc = await Tweet.findOne({ _id: bookmarkId, userId: oid(scope.userId) });
  if (!doc) throw notFound('That bookmark is not in your archive');
  if (!doc.aiSuggestion || doc.aiSuggestion.status !== 'pending') {
    throw badRequest('There is no pending suggestion for this bookmark');
  }

  let categoryId = doc.aiSuggestion.categoryId ? String(doc.aiSuggestion.categoryId) : null;

  if (!categoryId && doc.aiSuggestion.proposedCategoryName) {
    const name = doc.aiSuggestion.proposedCategoryName.trim();
    const created = await Category.findOneAndUpdate(
      { userId: oid(scope.userId), slug: name.toLowerCase() },
      {
        $setOnInsert: {
          userId: oid(scope.userId),
          name,
          slug: name.toLowerCase(),
          createdBy: 'ai',
        },
      },
      { upsert: true, new: true },
    );
    categoryId = String(created._id);
  }

  if (!categoryId) throw badRequest('That suggestion has no category to apply');

  const previous = doc.categoryId ? String(doc.categoryId) : null;

  doc.categoryId = oid(categoryId);
  // 'ai' records provenance — the user accepted, but the AI chose. Useful later
  // for "show me everything the AI filed" audits.
  doc.categorizationSource = 'ai';
  doc.humanEditedAt = new Date();
  doc.aiSuggestion.status = 'accepted';
  await doc.save();

  await syncCategoryCounts(scope.userId, [previous, categoryId]);

  const fresh = await Tweet.findById(doc._id).populate('categoryId', 'name slug color').lean();
  return serializeBookmark(fresh!);
}

export async function rejectSuggestion(scope: OwnerScope, bookmarkId: string) {
  const updated = await Tweet.findOneAndUpdate(
    { _id: bookmarkId, userId: oid(scope.userId), 'aiSuggestion.status': 'pending' },
    { $set: { 'aiSuggestion.status': 'rejected', humanEditedAt: new Date() } },
    { new: true },
  )
    .populate('categoryId', 'name slug color')
    .lean();

  if (!updated) throw notFound('There is no pending suggestion for this bookmark');
  return serializeBookmark(updated);
}

export async function updateNotes(scope: OwnerScope, bookmarkId: string, notes: string) {
  const updated = await Tweet.findOneAndUpdate(
    { _id: bookmarkId, userId: oid(scope.userId) },
    { $set: { notes } },
    { new: true },
  )
    .populate('categoryId', 'name slug color')
    .lean();
  if (!updated) throw notFound('That bookmark is not in your archive');
  return serializeBookmark(updated);
}

/**
 * Remove a bookmark from the archive.
 *
 * Note what this does NOT do: it does not delete the archived media objects.
 * Nothing else references them, so orphan cleanup would be safe, but doing it
 * inline would make an interactive delete depend on a third-party API call. A
 * periodic orphan sweep is the right place for that, and it is listed as
 * remaining work. (`deleteObject` in modules/media/r2.ts is what it would use.)
 */
export async function deleteBookmark(scope: OwnerScope, bookmarkId: string) {
  const doc = await Tweet.findOneAndDelete({
    _id: bookmarkId,
    userId: oid(scope.userId),
  }).lean();
  if (!doc) throw notFound('That bookmark is not in your archive');
  if (doc.categoryId) await syncCategoryCounts(scope.userId, [String(doc.categoryId)]);
}

/** Recompute denormalised counts for the affected categories only. */
export async function syncCategoryCounts(
  userId: string,
  categoryIds: Array<string | null>,
): Promise<void> {
  const unique = [...new Set(categoryIds.filter((id): id is string => Boolean(id)))];
  await Promise.all(
    unique.map(async (categoryId) => {
      const count = await Tweet.countDocuments({
        userId: oid(userId),
        categoryId: oid(categoryId),
      });
      await Category.updateOne(
        { _id: categoryId, userId: oid(userId) },
        { $set: { bookmarkCount: count } },
      );
    }),
  );
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

/**
 * The single boundary where a stored bookmark becomes an API response.
 *
 * **This is where media becomes reachable, and it is the only place that
 * happens.** The R2 bucket is private, so the stored object key is useless to a
 * client on its own; every URL in the response is a presigned GET URL minted
 * here, valid for `R2_SIGNED_URL_TTL_SECONDS`. The key itself is never
 * serialised — it is an internal handle the client has no use for, and handing
 * it out would invite attempts to use it as a capability.
 *
 * Ownership is enforced *before* this runs: every caller reaches this function
 * through a query that already filtered on `userId` (see `buildFilter`). A user
 * therefore cannot obtain a signature for another user's object by guessing a
 * tweet id, because the lookup that would produce the key finds nothing.
 *
 * Presigning is local HMAC computation, not a network call, which is why doing
 * it per media item per response is affordable.
 */
export async function serializeBookmark(doc: Record<string, any>) {
  const category =
    doc.categoryId && typeof doc.categoryId === 'object'
      ? {
          id: String(doc.categoryId._id),
          name: doc.categoryId.name,
          slug: doc.categoryId.slug,
          color: doc.categoryId.color,
        }
      : null;

  const [avatarUrl, media] = await Promise.all([
    presignGet(doc.author?.avatarStorageKey),
    Promise.all(
      (doc.media ?? []).map(async (m: Record<string, any>) => ({
        kind: m.kind,
        url: await presignGet(m.storageKey),
        posterUrl: await presignGet(m.posterStorageKey),
        sourceUrl: m.sourceUrl,
        width: m.width ?? null,
        height: m.height ?? null,
        altText: m.altText ?? '',
        status: m.status,
      })),
    ),
  ]);

  return {
    id: String(doc._id),
    tweetId: doc.tweetId,
    text: doc.text ?? '',
    originalUrl: doc.originalUrl,
    author: {
      name: doc.author?.name ?? '',
      handle: doc.author?.handle ?? '',
      avatarUrl: avatarUrl ?? doc.author?.avatarSourceUrl ?? null,
    },
    media,
    links: doc.links ?? [],
    tweetCreatedAt: doc.tweetCreatedAt ?? null,
    archivedAt: doc.archivedAt,
    category,
    categorizationSource: doc.categorizationSource ?? 'uncategorized',
    aiSuggestion:
      doc.aiSuggestion && doc.aiSuggestion.status === 'pending'
        ? {
            categoryId: doc.aiSuggestion.categoryId
              ? String(doc.aiSuggestion.categoryId)
              : null,
            proposedCategoryName: doc.aiSuggestion.proposedCategoryName ?? null,
            confidence: doc.aiSuggestion.confidence ?? null,
            reason: doc.aiSuggestion.reason ?? '',
            method: doc.aiSuggestion.method ?? null,
          }
        : null,
    mediaStatus: doc.mediaStatus ?? 'none',
    notes: doc.notes ?? '',
    missingFromX: Boolean(doc.missingFromX),
  };
}
