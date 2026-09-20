import type { Types } from 'mongoose';

/** How a bookmark ended up in its current category. */
export const CATEGORIZATION_SOURCES = ['manual', 'ai', 'uncategorized'] as const;
export type CategorizationSource = (typeof CATEGORIZATION_SOURCES)[number];

export const CATEGORY_CREATORS = ['manual', 'ai'] as const;
export type CategoryCreator = (typeof CATEGORY_CREATORS)[number];

/** Lifecycle of the media archival for one bookmark. */
export const MEDIA_STATUSES = ['pending', 'partial', 'complete', 'failed', 'none'] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export const X_SESSION_STATUSES = ['active', 'invalid', 'unverified'] as const;
export type XSessionStatus = (typeof X_SESSION_STATUSES)[number];

/**
 * Outcome of a sync run. `ok_no_new` and `ok_new` are both successes, but we
 * keep them distinct because AGENT.md §11 requires logs to distinguish
 * "successful scrape with zero new bookmarks" from every failure mode.
 */
export const SYNC_OUTCOMES = [
  'ok_new',
  'ok_no_new',
  'auth_failed',
  'selector_failed',
  'network_failed',
  'media_failed',
  'database_failed',
  'unknown_failed',
] as const;
export type SyncOutcome = (typeof SYNC_OUTCOMES)[number];

export const SUCCESSFUL_OUTCOMES: readonly SyncOutcome[] = ['ok_new', 'ok_no_new'];

export type ObjectId = Types.ObjectId;
