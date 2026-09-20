/**
 * Randomised delays for scraping.
 *
 * AGENT.md §12 asks that existing jitter be preserved. In fairness to the
 * record: the previous scraper used *fixed* waits (2000ms between scrolls,
 * 3000ms when called from scrapeBookmarks, 5000ms before extraction) rather
 * than jitter. Those base timings are kept — they were tuned against X's real
 * loading behaviour and work — and randomisation is layered on top, because a
 * perfectly periodic scroll every 3000.00ms is exactly the signal automated
 * traffic detection looks for.
 */

/** Uniform integer in [min, max]. */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** `base` ± `spread` percent. jitter(3000, 0.3) -> 2100..3900ms */
export function jitter(base: number, spread = 0.25): number {
  const delta = base * spread;
  return Math.round(base - delta + Math.random() * delta * 2);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Preserves the previous scraper's 2–3s scroll rhythm, now non-uniform. */
export const SCROLL_DELAY_BASE_MS = 3000;
/** Preserves the previous scraper's 5s settle before reading the DOM. */
export const SETTLE_DELAY_BASE_MS = 5000;

export function scrollDelay(): number {
  return jitter(SCROLL_DELAY_BASE_MS, 0.3);
}

export function settleDelay(): number {
  return jitter(SETTLE_DELAY_BASE_MS, 0.2);
}

/**
 * Occasionally pause longer than usual, the way a person reading their
 * bookmarks would. Roughly one scroll in eight.
 */
export function maybeLongPause(): number {
  return Math.random() < 0.125 ? randomInt(6000, 14000) : 0;
}

/** Scroll by a viewport-relative amount rather than always jumping to the bottom. */
export function scrollStepRatio(): number {
  return 0.75 + Math.random() * 0.5; // 0.75–1.25 viewports
}
