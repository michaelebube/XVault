import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { env } from '../config/env.js';
import { childLogger } from '../lib/logger.js';
import type { StorageState } from './session.js';
import { randomInt } from './humanDelay.js';

const log = childLogger('browser');

/**
 * Viewports of real desktop browsers. A fixed 1280x720 across every run for
 * every user is itself a fingerprint; picking from a small realistic set costs
 * nothing.
 */
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1512, height: 945 },
  { width: 1366, height: 768 },
  { width: 1680, height: 1050 },
] as const;

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface BrowserSessionHandles {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

/**
 * Opens a Chromium context, optionally seeded with a saved X session.
 *
 * The previous implementation used `chromium.launch` + `addCookies` with a
 * single `auth_token` from an env var. That is kept in spirit — cookie-based
 * auth, same browser engine — but generalised: we now restore Playwright's
 * full `storageState` (all cookies *and* localStorage) per user. X keeps parts
 * of its client state in localStorage, so cookie-only restoration produces
 * sessions that look logged in but behave oddly.
 *
 * `channel: 'chrome'` is deliberately NOT set: bundled Chromium is what gets
 * installed by `playwright install`, and requiring a real Chrome install would
 * make deployment fragile.
 */
export async function openBrowserSession(
  storageState: StorageState | null,
  options: { headless?: boolean } = {},
): Promise<BrowserSessionHandles> {
  const headless = options.headless ?? env.SCRAPE_HEADLESS;
  const viewport = VIEWPORTS[randomInt(0, VIEWPORTS.length - 1)]!;

  const browser = await chromium.launch({
    headless,
    args: [
      // Removes the most obvious automation tell without needing a stealth plugin.
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--no-sandbox',
    ],
  });

  const context = await browser.newContext({
    ...(storageState ? { storageState } : {}),
    viewport,
    userAgent: USER_AGENT,
    locale: 'en-US',
    timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    deviceScaleFactor: 1,
  });

  // `navigator.webdriver` is the single most commonly checked automation flag.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  context.setDefaultTimeout(45_000);
  context.setDefaultNavigationTimeout(60_000);

  const page = await context.newPage();

  // Block ad/analytics noise. Media requests are left alone: we need the real
  // image and video URLs from the DOM.
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (/googletagmanager|google-analytics|doubleclick|branch\.io|sentry\.io/.test(url)) {
      return route.abort();
    }
    return route.continue();
  });

  log.debug({ headless, viewport }, 'browser context opened');
  return { browser, context, page };
}

export async function closeBrowserSession(handles: BrowserSessionHandles): Promise<void> {
  await handles.context.close().catch(() => undefined);
  await handles.browser.close().catch(() => undefined);
}
