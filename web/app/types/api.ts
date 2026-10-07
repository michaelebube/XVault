/**
 * The API contract, mirrored from the server's serializers.
 *
 * These are hand-written rather than generated because the server owns exactly
 * three serialization boundaries (`publicUser`, `serializeBookmark`, the
 * category `serialize`) and each one is small. Keeping them here — and nowhere
 * else — means a response shape change surfaces as a type error in the pages
 * that read it.
 */

export type CategorizationSource = 'manual' | 'ai' | 'uncategorized';

export type CategoryColor =
  | 'neutral'
  | 'indigo'
  | 'violet'
  | 'blue'
  | 'teal'
  | 'green'
  | 'amber'
  | 'orange'
  | 'rose';

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: 'owner' | 'member';
  settings: Record<string, unknown>;
  createdAt?: string;
}

export interface AuthResponse {
  user: PublicUser;
  accessToken: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  color: CategoryColor;
  createdBy: 'manual' | 'ai';
  bookmarkCount: number;
  createdAt?: string;
}

export interface CategoryListResponse {
  categories: Category[];
  uncategorizedCount: number;
}

export interface BookmarkMedia {
  kind: 'image' | 'video' | 'gif';
  /**
   * Short-lived presigned R2 URL. Null until the media worker has archived the
   * asset, or if the archive has no storage credentials configured.
   */
  url: string | null;
  posterUrl: string | null;
  /** X's own CDN URL — metadata only, never the archive's source of truth. */
  sourceUrl: string;
  width: number | null;
  height: number | null;
  altText: string;
  status: 'pending' | 'uploaded' | 'failed' | 'skipped';
}

export interface BookmarkLink {
  url: string;
  displayUrl: string;
}

export interface AiSuggestion {
  categoryId: string | null;
  proposedCategoryName: string | null;
  confidence: number | null;
  reason: string;
  method: 'similarity' | 'llm' | null;
}

export interface Bookmark {
  id: string;
  tweetId: string;
  text: string;
  originalUrl: string;
  author: {
    name: string;
    handle: string;
    avatarUrl: string | null;
  };
  media: BookmarkMedia[];
  links: BookmarkLink[];
  tweetCreatedAt: string | null;
  archivedAt: string;
  category: Pick<Category, 'id' | 'name' | 'slug' | 'color'> | null;
  categorizationSource: CategorizationSource;
  /** Only ever populated while a suggestion is awaiting a decision. */
  aiSuggestion: AiSuggestion | null;
  mediaStatus: 'none' | 'pending' | 'partial' | 'complete' | 'failed';
  notes: string;
  missingFromX: boolean;
}

export interface BookmarkListResponse {
  items: Bookmark[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export type SyncHealth =
  | 'not_connected'
  | 'never_run'
  | 'syncing'
  | 'healthy'
  | 'needs_attention';

export interface SyncStatus {
  health: SyncHealth;
  connected: boolean;
  xHandle: string | null;
  sessionStatus: 'active' | 'invalid' | 'unverified' | 'disconnected';
  isRunning: boolean;
  lastRunAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastOutcome: string | null;
  consecutiveFailures: number;
  initialBackfillComplete: boolean;
  nextSyncAt: string | null;
  intervalHours: number;
  stats: {
    lastRunNewCount: number;
    lastRunSeenCount: number;
    totalRuns: number;
    totalArchived: number;
  };
  /** Operator detail — kept behind a disclosure in the UI (DESIGN.md §23). */
  lastErrorMessage: string | null;
}

export interface XAccountStatus {
  connected: boolean;
  status: 'active' | 'invalid' | 'unverified' | 'disconnected';
  xHandle: string | null;
  connectedAt?: string | null;
  lastValidatedAt?: string | null;
}

/** A row from `GET /auth/invites` (owner only). Never carries the code itself. */
export interface Invite {
  id: string;
  label?: string | null;
  used: boolean;
  usedBy: { email: string; displayName: string } | null;
  expiresAt: string;
  expired: boolean;
  createdAt: string;
}

/**
 * `POST /auth/invites`. The `code` is returned exactly once — the server stores
 * only its digest — so the UI must show it immediately or it is unrecoverable.
 */
export interface CreatedInvite {
  id: string;
  code: string;
  label?: string | null;
  expiresAt: string;
}

/** The server's single error envelope (middleware/errorHandler.ts). */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface BookmarkQuery {
  q?: string;
  /** A category id, or the literal 'none' for uncategorized. */
  categoryId?: string;
  author?: string;
  hasMedia?: boolean;
  hasLinks?: boolean;
  source?: CategorizationSource;
  pendingSuggestion?: boolean;
  sort?: 'newest' | 'oldest' | 'tweet_newest' | 'tweet_oldest';
  page?: number;
  limit?: number;
}
