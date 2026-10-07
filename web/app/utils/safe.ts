/**
 * Everything in this file exists because archived tweets are untrusted input
 * (AGENT.md §20). Text is rendered with `{{ }}` and never `v-html`, which Vue
 * escapes for us — but a URL is different: an anchor's `href` is executable
 * surface, and a `javascript:` URL in a scraped link would run on click.
 */

const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Returns the URL only if it is a plain web link, otherwise null.
 *
 * Callers render the link as inert text when this returns null, so a hostile
 * URL degrades to something visible and harmless rather than disappearing
 * silently.
 */
export function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return SAFE_PROTOCOLS.has(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Same rule for media: only ever load an image or video over http(s). */
export function safeMediaUrl(raw: string | null | undefined): string | null {
  return safeExternalUrl(raw);
}

/** `@handle`, with any leading @ the scraper may have kept stripped first. */
export function atHandle(handle: string | null | undefined): string {
  if (!handle) return '';
  return `@${handle.replace(/^@+/, '')}`;
}

export function xProfileUrl(handle: string | null | undefined): string | null {
  const clean = (handle ?? '').replace(/^@+/, '');
  return /^[A-Za-z0-9_]{1,15}$/.test(clean) ? `https://x.com/${clean}` : null;
}
