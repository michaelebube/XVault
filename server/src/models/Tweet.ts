import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { CATEGORIZATION_SOURCES, MEDIA_STATUSES } from './types.js';

/**
 * One archived media item.
 *
 * Only the **object key** is stored, never a URL. The R2 bucket is private, so
 * there is no permanent URL to store: every URL the UI renders is presigned at
 * response time from `storageKey` and expires. `sourceUrl` is kept as metadata
 * only — AGENT.md §14 is explicit that X's CDN is not the permanent store, and
 * the archive stays intact when the tweet is deleted.
 */
const mediaSchema = new Schema(
  {
    kind: { type: String, enum: ['image', 'video', 'gif'], required: true },
    sourceUrl: { type: String, required: true },
    /** R2 object key, e.g. `xvault/<userId>/tweets/<tweetId>/0.jpg`. */
    storageKey: { type: String, default: null },
    /** Video poster frame: also archived, so cards render without loading video. */
    posterSourceUrl: { type: String, default: null },
    posterStorageKey: { type: String, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    durationMs: { type: Number, default: null },
    altText: { type: String, default: '', maxlength: 1000 },
    status: {
      type: String,
      enum: ['pending', 'archived', 'failed'],
      default: 'pending',
    },
    /** Short reason, for the debug panel. Never shown as a raw error to users. */
    failureReason: { type: String, default: null, maxlength: 300 },
    attempts: { type: Number, default: 0 },
  },
  { _id: false },
);

const authorSchema = new Schema(
  {
    name: { type: String, default: '', maxlength: 200 },
    handle: { type: String, default: '', maxlength: 100 },
    avatarSourceUrl: { type: String, default: null },
    avatarStorageKey: { type: String, default: null },
  },
  { _id: false },
);

const linkSchema = new Schema(
  {
    /** The href as it appears on the card (usually a t.co shortlink). */
    url: { type: String, required: true },
    /** The human-readable text X displays, e.g. "github.com/foo/bar". */
    displayUrl: { type: String, default: '' },
  },
  { _id: false },
);

/**
 * An AI category suggestion. Stored *beside* `categoryId` rather than written
 * into it, because the default contract is "AI suggests, human confirms"
 * (AGENT.md §16). Accepting a suggestion is what moves it into `categoryId`.
 */
const aiSuggestionSchema = new Schema(
  {
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    /** Set when the AI proposes a category that does not exist yet. */
    proposedCategoryName: { type: String, default: null, maxlength: 60 },
    confidence: { type: Number, min: 0, max: 1, default: null },
    reason: { type: String, default: '', maxlength: 400 },
    method: { type: String, enum: ['similarity', 'llm'], default: null },
    model: { type: String, default: null },
    suggestedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending',
    },
  },
  { _id: false },
);

const tweetSchema = new Schema(
  {
    /** The numeric status id from X. Unique *per user*, not globally. */
    tweetId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    author: { type: authorSchema, default: () => ({}) },
    text: { type: String, default: '', maxlength: 10_000 },
    media: { type: [mediaSchema], default: [] },
    links: { type: [linkSchema], default: [] },

    originalUrl: { type: String, required: true },
    /** From the tweet's <time datetime="..."> attribute. */
    tweetCreatedAt: { type: Date, default: null },
    archivedAt: { type: Date, default: () => new Date(), index: true },

    /**
     * Position on the bookmarks page in the run that discovered this tweet
     * (0 = topmost = most recently bookmarked). X does not expose a "bookmarked
     * at" timestamp, so page order is the only signal we have for the order the
     * user saved things in. Combined with archivedAt this gives a stable sort.
     */
    bookmarkRank: { type: Number, default: 0 },

    categoryId: { type: Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    categorizationSource: {
      type: String,
      enum: CATEGORIZATION_SOURCES,
      default: 'uncategorized',
    },
    /**
     * Set whenever a human changes the category. The AI worker refuses to touch
     * a bookmark edited within AI_HUMAN_EDIT_LOCK_MINUTES (AGENT.md §17).
     */
    humanEditedAt: { type: Date, default: null },

    aiSuggestion: { type: aiSuggestionSchema, default: null },

    mediaStatus: { type: String, enum: MEDIA_STATUSES, default: 'pending', index: true },
    /** Bumped when media archival fails, so we can retry with backoff. */
    mediaAttempts: { type: Number, default: 0 },

    /** Marked true if a later check finds the tweet gone from X. Never deletes. */
    missingFromX: { type: Boolean, default: false },

    notes: { type: String, default: '', maxlength: 2000 },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

/**
 * THE identity constraint. `userId + tweetId` is the bookmark identity
 * (AGENT.md §10): the same user cannot archive one tweet twice, but two users
 * can each archive the same tweet independently.
 *
 * This is a database-level guarantee on purpose. An application-level "does it
 * exist?" check is not enough — two scrape runs (a scheduled one and a manual
 * one) could pass that check at the same moment and both insert. The unique
 * index is what actually makes the writes idempotent; the scraper relies on it
 * via upserts rather than trying to prevent the race itself.
 */
tweetSchema.index({ userId: 1, tweetId: 1 }, { unique: true });

/** Default library feed: newest-saved first, page order as the tiebreaker. */
tweetSchema.index({ userId: 1, archivedAt: -1, bookmarkRank: 1 });

/** Browsing one category, and the "uncategorized" view (categoryId: null). */
tweetSchema.index({ userId: 1, categoryId: 1, archivedAt: -1 });

/** The AI worker's queue: uncategorized bookmarks with no pending suggestion. */
tweetSchema.index({ userId: 1, categorizationSource: 1, archivedAt: -1 });

/** The media worker's queue: anything not yet fully archived. */
tweetSchema.index({ mediaStatus: 1, mediaAttempts: 1 });

/**
 * Full-text search over content + author, scoped by user.
 *
 * MongoDB allows only one text index per collection, and a compound text index
 * may be prefixed with ordinary keys — provided every query supplies an equality
 * match on that prefix. Putting `userId` first is therefore both a performance
 * win and an isolation guarantee: a text search that forgets `userId` does not
 * silently scan other users' archives, it simply cannot use the index.
 */
tweetSchema.index(
  { userId: 1, text: 'text', 'author.name': 'text', 'author.handle': 'text' },
  {
    name: 'tweet_search',
    weights: { text: 10, 'author.name': 4, 'author.handle': 4 },
    default_language: 'english',
  },
);

export type TweetAttrs = InferSchemaType<typeof tweetSchema>;
export type TweetDoc = HydratedDocument<TweetAttrs>;
export type MediaAttrs = InferSchemaType<typeof mediaSchema>;

export const Tweet = model('Tweet', tweetSchema);
