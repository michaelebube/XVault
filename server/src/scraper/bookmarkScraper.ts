import type { Page } from 'playwright';
import { env } from '../config/env.js';
import { childLogger, type Logger } from '../lib/logger.js';
import { closeBrowserSession, openBrowserSession } from './browser.js';
import {
  extractVisibleBookmarks,
  isLoggedOut,
  probeTimeline,
  readSignedInHandle,
  scrollViewport,
  SELECTORS,
  type RawBookmark,
} from '../browser/extract.js';
import { authFailure, networkFailure, selectorFailure } from './errors.js';
import {
  maybeLongPause,
  scrollDelay,
  scrollStepRatio,
  settleDelay,
  sleep,
} from './humanDelay.js';
import { loadSessionState, saveSessionState, type StorageState } from './session.js';

const log = childLogger('scraper');

const BOOKMARKS_URL = 'https://x.com/i/bookmarks';
const HOME_URL = 'https://x.com/home';

export type StopReason =
  | 'newest_marker'
  | 'known_streak'
  | 'end_of_timeline'
  | 'max_bookmarks'
  | 'max_scrolls';

export interface ScrapeOptions {
  userId: string;
  /** Every tweetId this user already has archived. Used for the streak check. */
  knownTweetIds: Set<string>;
  /** Topmost bookmark from the last successful run, if any. */
  newestTweetId: string | null;
  /** A full walk ignores both stop signals (initial backfill / repair run). */
  fullScan?: boolean;
}

export interface ScrapeResult {
  bookmarks: RawBookmark[];
  /** Total distinct cards observed, including ones we already had. */
  seenCount: number;
  stoppedBecause: StopReason;
  /** Topmost bookmark on the page this run — the next run's marker. */
  topTweetId: string | null;
  xHandle: string | null;
  /** True only when X itself said the archive is empty. */
  emptyArchive: boolean;
  scrolls: number;
}

export async function scrapeUserBookmarks(options: ScrapeOptions): Promise<ScrapeResult> {
  const { userId } = options;
  const runLog = log.child({ userId });

  const storageState = await loadSessionState(userId);
  if (!storageState) {
    throw authFailure('No X session stored for this user — they need to connect X');
  }

  const handles = await openBrowserSession(storageState);

  try {
    const { page } = handles;

    // Load /home first. Inherited from the previous implementation: X sets and
    // refreshes several client cookies on the app shell, and going straight to a
    // deep link with a cold context is noticeably more likely to bounce to login.
    try {
      await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });
    } catch (err) {
      throw networkFailure('Could not load x.com/home', err);
    }
    await sleep(settleDelay());

    if (await isLoggedOut(page)) {
      throw authFailure('X redirected to login — the stored session is no longer valid');
    }

    const xHandle = await readSignedInHandle(page);

    try {
      await page.goto(BOOKMARKS_URL, { waitUntil: 'domcontentloaded' });
    } catch (err) {
      throw networkFailure('Could not load the bookmarks page', err);
    }

    if (await isLoggedOut(page)) {
      throw authFailure('X redirected to login when opening bookmarks');
    }

    await waitForTimelineOrEmptyState(page);

    const probe = await probeTimeline(page);
    runLog.debug({ probe }, 'timeline probe');

    if (probe.hasErrorPanel) {
      throw networkFailure(`X rendered an error panel on the bookmarks page`);
    }

    /**
     * The zero-result decision, which AGENT.md §11 calls out specifically.
     *
     * "No tweets found" is only ever reported as success when X *itself* told us
     * the archive is empty via its own empty-state panel. A page with no cards
     * and no empty state means our selectors no longer match what X renders —
     * that is a loud, non-retryable selector failure, never "you have no
     * bookmarks".
     */
    if (probe.tweetCount === 0) {
      if (probe.hasEmptyState) {
        runLog.info(
          { emptyStateText: probe.emptyStateText },
          'X reports an empty bookmark archive — treating as a successful empty scrape',
        );
        return {
          bookmarks: [],
          seenCount: 0,
          stoppedBecause: 'end_of_timeline',
          topTweetId: null,
          xHandle,
          emptyArchive: true,
          scrolls: 0,
        };
      }

      throw selectorFailure(
        'Bookmarks page rendered but no tweet cards matched our selectors — X markup has probably changed',
        {
          url: probe.url,
          hasPrimaryColumn: probe.hasPrimaryColumn,
          tweetSelector: SELECTORS.tweet,
        },
      );
    }

    const result = await walkTimeline(page, options, runLog);

    // Persist the session again after a successful run: X rotates cookies (ct0,
    // guest_id and friends) as you browse. Saving the refreshed state is what
    // keeps a session alive across months of 72-hour runs instead of slowly
    // going stale and forcing a reconnect.
    const refreshed = (await handles.context.storageState()) as StorageState;
    await saveSessionState(userId, refreshed, xHandle ?? undefined);

    return { ...result, xHandle, emptyArchive: false };
  } finally {
    await closeBrowserSession(handles);
  }
}

async function waitForTimelineOrEmptyState(page: Page): Promise<void> {
  try {
    await page.waitForSelector(`${SELECTORS.tweet}, ${SELECTORS.emptyState}`, {
      timeout: 60_000,
    });
  } catch {
    // Not fatal here on purpose: probeTimeline runs next and produces a much
    // more specific diagnosis (empty state vs. selector failure vs. error panel).
  }
  await sleep(settleDelay());
}

/**
 * Scroll the bookmarks timeline, extracting as we go.
 *
 * The stable-count loop is taken from the previous implementation: scroll, count
 * cards, and give up after three consecutive scrolls that produced nothing new.
 * That heuristic is genuinely good — X's infinite scroll has no "end" marker, so
 * counting is the only reliable end detection — and it is kept, with three
 * changes:
 *
 *   1. Cards are extracted after every scroll, not once at the end (the
 *      timeline is virtualised and unmounts off-screen cards).
 *   2. Scroll distance and delay are randomised (see humanDelay.ts).
 *   3. Two incremental stop signals let a routine run finish in seconds instead
 *      of walking the entire archive every 72 hours.
 */
async function walkTimeline(
  page: Page,
  options: ScrapeOptions,
  runLog: Logger,
): Promise<Omit<ScrapeResult, 'xHandle' | 'emptyArchive'>> {
  const collected = new Map<string, RawBookmark>();
  const fullScan = options.fullScan ?? false;

  let knownStreak = 0;
  let stableScrolls = 0;
  let previousCount = 0;
  let stoppedBecause: StopReason = 'max_scrolls';
  let topTweetId: string | null = null;
  let scrolls = 0;
  let hitMarker = false;

  // A generous bound; the stop signals below normally fire long before this.
  const maxScrolls = fullScan ? 1000 : 300;

  for (scrolls = 0; scrolls < maxScrolls; scrolls++) {
    const batch = await extractVisibleBookmarks(page);

    for (const bookmark of batch) {
      if (topTweetId === null) topTweetId = bookmark.tweetId;
      if (collected.has(bookmark.tweetId)) continue;
      collected.set(bookmark.tweetId, bookmark);

      if (!fullScan) {
        if (options.newestTweetId && bookmark.tweetId === options.newestTweetId) {
          hitMarker = true;
        }
        if (options.knownTweetIds.has(bookmark.tweetId)) {
          knownStreak += 1;
        } else {
          // Reset on anything new. A single already-seen tweet in the middle of
          // new ones is normal (the user may have re-bookmarked something); only
          // an unbroken run of known tweets means we have reached old ground.
          knownStreak = 0;
        }
      }
    }

    const newCount = countUnknown(collected, options.knownTweetIds);

    // --- stop conditions -------------------------------------------------
    if (!fullScan && hitMarker && knownStreak >= 3) {
      stoppedBecause = 'newest_marker';
      break;
    }
    if (!fullScan && knownStreak >= env.SCRAPE_KNOWN_STREAK_STOP) {
      stoppedBecause = 'known_streak';
      break;
    }
    if (newCount >= env.SCRAPE_MAX_BOOKMARKS_PER_RUN) {
      stoppedBecause = 'max_bookmarks';
      runLog.warn(
        { newCount },
        'hit SCRAPE_MAX_BOOKMARKS_PER_RUN — remaining bookmarks will be picked up next run',
      );
      break;
    }

    if (collected.size === previousCount) {
      stableScrolls += 1;
    } else {
      stableScrolls = 0;
      previousCount = collected.size;
    }

    if (stableScrolls >= 3) {
      stoppedBecause = 'end_of_timeline';
      break;
    }

    await scrollOnce(page);
    runLog.debug(
      { scroll: scrolls + 1, collected: collected.size, newCount, knownStreak },
      'scrolled bookmarks timeline',
    );
  }

  const bookmarks = [...collected.values()];

  runLog.info(
    {
      seen: bookmarks.length,
      new: countUnknown(collected, options.knownTweetIds),
      stoppedBecause,
      scrolls,
    },
    'finished walking bookmarks timeline',
  );

  return {
    bookmarks,
    seenCount: bookmarks.length,
    stoppedBecause,
    topTweetId,
    scrolls,
  };
}

function countUnknown(collected: Map<string, RawBookmark>, known: Set<string>): number {
  let n = 0;
  for (const id of collected.keys()) if (!known.has(id)) n += 1;
  return n;
}

async function scrollOnce(page: Page): Promise<void> {
  // The scroll itself runs in the page and therefore lives in the DOM-typed
  // browser project; the jitter that decides *how far* stays here on the Node
  // side, where humanDelay can be imported.
  await scrollViewport(page, scrollStepRatio());

  await sleep(scrollDelay());

  const longPause = maybeLongPause();
  if (longPause > 0) await sleep(longPause);
}
