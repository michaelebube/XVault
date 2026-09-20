import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { SYNC_OUTCOMES } from './types.js';

/**
 * Per-user scraper state. One document per user, created lazily.
 *
 * This is what makes scraping *incremental* (AGENT.md §10). The scraper walks
 * the bookmarks page from the top (most recently bookmarked) downwards, and
 * stops once it is confident it has reached bookmarks it already has.
 *
 * Two independent signals, deliberately:
 *   1. `newestTweetId` — the topmost bookmark from the last successful run.
 *   2. a run of consecutive already-archived tweets (`SCRAPE_KNOWN_STREAK_STOP`).
 *
 * Why not trust (1) alone? Because a user can un-bookmark the top item, or X
 * can reorder the timeline, and then the marker never appears and we would walk
 * the whole archive. Why not trust a single already-seen tweet? Because X
 * occasionally interleaves items, and stopping on the first known tweet could
 * skip newer ones below it. AGENT.md §10 says to prefer harmless reprocessing
 * over missed bookmarks, so we require a *streak* before stopping.
 *
 * Neither signal is a correctness guarantee — the unique index on
 * (userId, tweetId) is. This state is only an optimisation.
 */
const syncStateSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    /** Topmost bookmark id observed on the last successful run. */
    newestTweetId: { type: String, default: null },
    lastSuccessfulSyncAt: { type: Date, default: null },
    lastRunAt: { type: Date, default: null },
    lastOutcome: { type: String, enum: SYNC_OUTCOMES, default: null },
    /** Operator-facing detail. Users see a friendly message instead. */
    lastErrorMessage: { type: String, default: null, maxlength: 600 },

    consecutiveFailures: { type: Number, default: 0 },
    /** True while a run holds the lock; prevents overlapping scrapes. */
    isRunning: { type: Boolean, default: false },
    runStartedAt: { type: Date, default: null },
    currentJobId: { type: String, default: null },

    /** Set when the archive has never been walked end-to-end. */
    initialBackfillComplete: { type: Boolean, default: false },

    stats: {
      lastRunNewCount: { type: Number, default: 0 },
      lastRunSeenCount: { type: Number, default: 0 },
      totalRuns: { type: Number, default: 0 },
      totalArchived: { type: Number, default: 0 },
    },
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

export type SyncStateAttrs = InferSchemaType<typeof syncStateSchema>;
export type SyncStateDoc = HydratedDocument<SyncStateAttrs>;

export const SyncState = model('SyncState', syncStateSchema);
