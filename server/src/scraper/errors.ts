import type { SyncOutcome } from '../models/types.js';

/**
 * Scraper failures are classified, not stringly-typed.
 *
 * AGENT.md §11 requires logs and status to distinguish auth failure from
 * selector failure from network failure. The class of failure also decides
 * behaviour: an auth failure must mark the X session invalid and must NOT be
 * retried (retrying a dead session just burns attempts), whereas a network
 * failure should be retried with backoff.
 */
export class ScrapeError extends Error {
  readonly outcome: SyncOutcome;
  /** False for failures that retrying cannot fix. */
  readonly retryable: boolean;
  readonly context?: Record<string, unknown>;

  constructor(
    outcome: SyncOutcome,
    message: string,
    options: { retryable?: boolean; context?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'ScrapeError';
    this.outcome = outcome;
    this.retryable = options.retryable ?? true;
    this.context = options.context;
  }
}

/** The stored X session is no longer accepted by X. The user must reconnect. */
export const authFailure = (message: string, cause?: unknown) =>
  new ScrapeError('auth_failed', message, { retryable: false, cause });

/**
 * The page loaded but did not look like the bookmarks timeline we know how to
 * read. Almost always means X changed its DOM. Loud and non-retryable, because
 * retrying identical broken selectors wastes attempts and hides the problem.
 */
export const selectorFailure = (message: string, context?: Record<string, unknown>) =>
  new ScrapeError('selector_failed', message, { retryable: false, context });

export const networkFailure = (message: string, cause?: unknown) =>
  new ScrapeError('network_failed', message, { retryable: true, cause });

export const databaseFailure = (message: string, cause?: unknown) =>
  new ScrapeError('database_failed', message, { retryable: true, cause });
