import type { Page } from 'playwright';

/**
 * Code in `src/browser/` is different from the rest of the server: the callbacks
 * passed to `page.evaluate` are serialised and executed **inside the page**, not
 * in Node. They therefore need `lib.dom` — but the API, the workers and the
 * models must not, because a stray `document` reference in an Express handler
 * should stay a compile error rather than a 500 at runtime.
 *
 * That is why this directory is its own TypeScript project
 * (`server/tsconfig.browser.json`, referenced from `server/tsconfig.json`): it
 * is the only place compiled with DOM types. Two consequences to respect when
 * editing:
 *
 *   1. Nothing here may import from the rest of `src/` — a file cannot belong to
 *      two projects. Anything the browser code needs is passed in as an
 *      argument, which is also the only thing `page.evaluate` can transfer.
 *   2. Everything crossing back out (`RawBookmark`, `TimelineProbe`) is plain
 *      data, so the Node side never sees a DOM type.
 *   3. A `page.evaluate` callback must not define *named* functions, because the
 *      source that runs in the page is the **compiled** one. In dev the worker
 *      runs under `tsx`, which enables esbuild's `keepNames`: `const fn = () => …`
 *      is rewritten to `__name(() => …, "fn")`, and `__name` exists in Node but
 *      not in the page, so the call dies with `ReferenceError: __name is not
 *      defined`. Object shorthand methods are left alone by that transform —
 *      see `extractVisibleBookmarks`.
 */

/** One bookmark as read from the DOM, before any archival work. */
export interface RawBookmark {
  tweetId: string;
  originalUrl: string;
  text: string;
  authorName: string;
  authorHandle: string;
  authorAvatarUrl: string | null;
  tweetCreatedAt: string | null;
  images: Array<{ url: string; altText: string }>;
  videos: Array<{ posterUrl: string | null; sourceUrl: string | null; isGif: boolean }>;
  links: Array<{ url: string; displayUrl: string }>;
}

export interface TimelineProbe {
  tweetCount: number;
  /** X's own "you have no bookmarks" panel. */
  hasEmptyState: boolean;
  emptyStateText: string;
  /** A <main> / primary column exists, i.e. an app shell actually rendered. */
  hasPrimaryColumn: boolean;
  hasErrorPanel: boolean;
  url: string;
}

/**
 * Selector constants, in one place.
 *
 * `article[data-testid="tweet"]` is inherited from the previous implementation
 * and is still the right anchor — it is the most stable hook X exposes. What
 * changed is everything *inside* the card: the old code used `el.innerText` for
 * the tweet body (which swallows the author, handle, timestamp and engagement
 * counts into `text`) and `div[dir="ltr"] span` for the author (which grabs
 * whichever span happens to come first). Both produced wrong data, so they are
 * replaced with X's own semantic testids.
 */
export const SELECTORS = {
  tweet: 'article[data-testid="tweet"]',
  tweetText: '[data-testid="tweetText"]',
  userName: '[data-testid="User-Name"]',
  avatar: '[data-testid="Tweet-User-Avatar"] img, [data-testid^="UserAvatar-Container"] img',
  photo: '[data-testid="tweetPhoto"]',
  emptyState: '[data-testid="empty_state_header_text"]',
  errorPanel: '[data-testid="error-detail"]',
  primaryColumn: '[data-testid="primaryColumn"]',
  loginForm: 'input[autocomplete="username"], [data-testid="loginButton"]',
} as const;

/** URLs that mean "X is showing its own auth flow", not an app page. */
const AUTH_URL_RE = /\/(i\/flow\/)?login|\/i\/flow\/signup|\/account\/access/;

/**
 * Whether a URL belongs to X's login/verification flow.
 *
 * Pure, and takes the URL rather than the Page, so callers can decide *from
 * Node* whether it is safe to touch the page at all — see the retry note below.
 */
export function isOnAuthUrl(url: string): boolean {
  return AUTH_URL_RE.test(url);
}

/**
 * Anything that reads the DOM — `page.evaluate` and locator queries alike —
 * runs inside the page's JavaScript execution context, and the browser destroys
 * that context on every navigation. X's login flow navigates between each step,
 * so a read that happens to be in flight fails with:
 *
 *     Execution context was destroyed, most likely because of a navigation
 *
 * That is a race against a page that is working correctly, so it is retried.
 * Nothing else is: a selector failure, an auth failure, a closed browser or a
 * timeout still propagates, because AGENT.md §11 requires those to stay loud.
 */
const NAVIGATION_RACE =
  /execution context was destroyed|because of a navigation|frame was detached|navigation interrupted/i;

export async function withNavigationRetry<T>(
  page: Page,
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!NAVIGATION_RACE.test(message)) throw err;
      lastError = err;
      // Let the navigation that destroyed the context finish before retrying.
      await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined);
    }
  }
  throw lastError;
}

/**
 * Cheap structural check used to tell three situations apart, which AGENT.md
 * §11 insists must never be conflated:
 *   - a real, empty bookmarks page          -> hasEmptyState
 *   - a page that rendered but has no cards -> selector failure
 *   - a page that never rendered at all     -> network/auth failure
 */
export async function probeTimeline(page: Page): Promise<TimelineProbe> {
  return withNavigationRetry(page, () => probeTimelineOnce(page));
}

async function probeTimelineOnce(page: Page): Promise<TimelineProbe> {
  return page.evaluate((sel) => {
    const emptyEl = document.querySelector(sel.emptyState);
    return {
      tweetCount: document.querySelectorAll(sel.tweet).length,
      hasEmptyState: Boolean(emptyEl),
      emptyStateText: (emptyEl as HTMLElement | null)?.innerText ?? '',
      hasPrimaryColumn: Boolean(document.querySelector(sel.primaryColumn)),
      hasErrorPanel: Boolean(document.querySelector(sel.errorPanel)),
      url: window.location.href,
    };
  }, SELECTORS);
}

/**
 * Whether the page is showing X's login surface rather than a signed-in app page.
 *
 * The URL is checked first, in Node, because during the login flow that is the
 * only safe thing to read: the page is mid-navigation most of the time. The DOM
 * check is a locator query rather than `page.evaluate` so that Playwright's own
 * retry-on-navigation applies, and it is wrapped for the case where the context
 * dies anyway.
 */
export async function isLoggedOut(page: Page): Promise<boolean> {
  if (isOnAuthUrl(page.url())) return true;
  const loginFormCount = await withNavigationRetry(page, () =>
    page.locator(SELECTORS.loginForm).count(),
  );
  return loginFormCount > 0;
}

/**
 * Reads the signed-in handle from the account switcher, for display only.
 *
 * Returns null when the switcher is not rendered inside `timeoutMs` — during the
 * connect flow that means "not signed in yet", which is an expected state and
 * not an error. Any other Playwright failure is rethrown.
 */
export async function readSignedInHandle(page: Page, timeoutMs = 2000): Promise<string | null> {
  const switcher = page.locator('[data-testid="SideNav_AccountSwitcher_Button"]').first();
  return withNavigationRetry(page, async () => {
    try {
      const raw = await switcher.textContent({ timeout: timeoutMs });
      return raw?.match(/@([A-Za-z0-9_]{1,15})/)?.[1] ?? null;
    } catch (err) {
      if (err instanceof Error && err.name === 'TimeoutError') return null;
      throw err;
    }
  });
}

/**
 * Scroll the timeline by a fraction of the viewport.
 *
 * The ratio is supplied by the caller rather than computed here: the jitter
 * logic lives in `scraper/humanDelay.ts`, on the Node side, and browser-context
 * code cannot import it (see the note at the top of this file).
 */
export async function scrollViewport(page: Page, ratio: number): Promise<void> {
  await page.evaluate((r) => {
    window.scrollBy({ top: window.innerHeight * r, behavior: 'smooth' });
  }, ratio);
}

/**
 * Extracts every bookmark card currently mounted in the DOM.
 *
 * This is called repeatedly *during* scrolling rather than once at the end. The
 * previous implementation scrolled to the bottom first and only then read the
 * DOM, which silently loses data: X's timeline is virtualised and unmounts
 * cards that scroll far out of view, so a long archive would come back with
 * only the last screenful. Extract-as-you-scroll plus de-duplication by tweetId
 * is the fix.
 */
export async function extractVisibleBookmarks(page: Page): Promise<RawBookmark[]> {
  return page.evaluate((sel) => {
    const STATUS_RE = /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([^/]+)\/status\/(\d+)/;

    const quoteByCard = new WeakMap<Element, Element | null>();

    /**
     * Browser-side helpers are object shorthand methods, never `const fn = …`.
     *
     * Under `tsx` (the dev worker runtime) esbuild's `keepNames` rewrites named
     * function expressions and function declarations into a wrapper call to a
     * module-scope `__name` helper, and `page.evaluate` sends the *compiled*
     * source of this arrow into the page — where that helper does not exist.
     * Shorthand methods are not rewritten, so the callback stays self-contained
     * and browser-safe. Details in the note at the top of this file.
     */
    const h = {
      text(el: Element | null | undefined): string {
        return (el as HTMLElement | null)?.innerText?.trim() ?? '';
      },
      /**
       * A quoted tweet is rendered *inside* the same article, as a nested
       * role="link" block. Without excluding it, the quote's text, author and
       * media get mixed into the parent tweet. `inQuote` is how every lookup
       * below stays on the outer tweet. The lookup is cached per card because
       * `pick`/`pickAll` run it once per candidate element.
       */
      quoteOf(card: Element): Element | null {
        if (!quoteByCard.has(card)) {
          quoteByCard.set(card, card.querySelector('div[role="link"][tabindex]'));
        }
        return quoteByCard.get(card) ?? null;
      },
      inQuote(card: Element, el: Element): boolean {
        const quote = h.quoteOf(card);
        return Boolean(quote && quote.contains(el));
      },
      pick<T extends Element>(card: Element, selector: string): T | null {
        for (const el of Array.from(card.querySelectorAll(selector))) {
          if (!h.inQuote(card, el)) return el as T;
        }
        return null;
      },
      pickAll<T extends Element>(card: Element, selector: string): T[] {
        return Array.from(card.querySelectorAll(selector)).filter(
          (el) => !h.inQuote(card, el),
        ) as T[];
      },
    };

    const results: RawBookmark[] = [];

    for (const card of Array.from(document.querySelectorAll(sel.tweet))) {
      // --- identity -------------------------------------------------------
      // The permalink is the anchor that wraps the timestamp. Falling back to
      // any /status/ link would happily pick up "/status/123/photo/1" or the
      // analytics link, which is how the old `link.split('/').pop()` produced
      // ids like "photo" and "1".
      const timeEl = h.pick<HTMLTimeElement>(card, 'time[datetime]');
      let permalink =
        (timeEl?.closest('a') as HTMLAnchorElement | null)?.href ??
        h.pick<HTMLAnchorElement>(card, 'a[href*="/status/"]')?.href ??
        '';

      const match = STATUS_RE.exec(permalink);
      if (!match) continue; // Not a tweet card we can identify; skip rather than guess.
      const handleFromUrl = match[1] ?? '';
      const tweetId = match[2] ?? '';
      permalink = `https://x.com/${handleFromUrl}/status/${tweetId}`;

      // --- author ---------------------------------------------------------
      const userNameEl = h.pick<HTMLElement>(card, sel.userName);
      const userNameText = h.text(userNameEl);
      // The block renders as "Display Name\n@handle\n·\n2h". Split on newlines
      // and take the first line as the name, and the @token as the handle.
      const lines = userNameText.split('\n').map((l) => l.trim()).filter(Boolean);
      const handleLine = lines.find((l) => l.startsWith('@'));
      const authorHandle = (handleLine ?? `@${handleFromUrl}`).replace(/^@/, '');
      const authorName = lines.find((l) => !l.startsWith('@') && l !== '·') ?? authorHandle;

      const avatarImg = h.pick<HTMLImageElement>(card, sel.avatar);

      // --- body -----------------------------------------------------------
      const tweetTextEl = h.pick<HTMLElement>(card, sel.tweetText);

      // --- media ----------------------------------------------------------
      const images = h
        .pickAll<HTMLElement>(card, sel.photo)
        .map((container) => {
          const img = container.querySelector('img');
          if (!img) return null;
          return { url: img.src, altText: img.alt ?? '' };
        })
        .filter((v): v is { url: string; altText: string } => Boolean(v?.url));

      const videos = h.pickAll<HTMLVideoElement>(card, 'video').map((video) => {
        // X streams most video through MSE, so `video.src` is a blob: URL that
        // is meaningless outside the page. GIFs and some short clips do expose
        // a real video.twimg.com source, which we can archive directly.
        const direct = [video.getAttribute('src'), video.querySelector('source')?.getAttribute('src')]
          .filter((u): u is string => Boolean(u))
          .find((u) => !u.startsWith('blob:')) ?? null;
        return {
          posterUrl: video.getAttribute('poster'),
          sourceUrl: direct,
          isGif: Boolean(direct && /tweet_video/.test(direct)),
        };
      });

      // --- links ----------------------------------------------------------
      const links = h
        .pickAll<HTMLAnchorElement>(card, 'a[href^="http"]')
        .filter((a) => !STATUS_RE.test(a.href) && !a.href.includes('/hashtag/'))
        .map((a) => ({ url: a.href, displayUrl: a.innerText.trim() }))
        .filter((l, i, arr) => arr.findIndex((x) => x.url === l.url) === i);

      results.push({
        tweetId,
        originalUrl: permalink,
        text: h.text(tweetTextEl),
        authorName,
        authorHandle,
        authorAvatarUrl: avatarImg?.src ?? null,
        tweetCreatedAt: timeEl?.getAttribute('datetime') ?? null,
        images,
        videos,
        links,
      });
    }

    return results;
  }, SELECTORS);
}
