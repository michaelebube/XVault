import { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env, r2Configured } from '../../config/env.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger('r2');

/** Cloudflare's S3 endpoint always uses this region string. */
const R2_REGION = 'auto';

/** A single asset download that takes longer than this is not going to finish. */
const REMOTE_FETCH_TIMEOUT_MS = 120_000;

let client: S3Client | null = null;

/**
 * Configure lazily rather than at import time.
 *
 * The API process must be able to boot before R2 credentials exist (env.ts marks
 * them optional for exactly this reason), so the SDK is only touched the first
 * time something actually uploads or signs.
 */
function ensureClient(): S3Client {
  if (client) return client;

  if (!r2Configured) {
    throw new Error('Cloudflare R2 is not configured (R2_* env vars missing)');
  }

  client = new S3Client({
    region: R2_REGION,
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    },
    /**
     * Path-style addressing (`/<bucket>/<key>`) rather than virtual-host style
     * (`<bucket>.<account>.r2.cloudflarestorage.com`). R2 supports both, but
     * virtual-host style breaks for any bucket name containing a dot, because
     * the TLS certificate's wildcard does not cover `a.b.domain`. Path style
     * cannot fail that way, so it is the safer default here.
     */
    forcePathStyle: true,
    /**
     * Do not attach CRC32 checksums to the request unless S3 requires one.
     *
     * Since v3.729 the AWS SDK defaults to `WHEN_SUPPORTED`, which for a
     * streamed body means an `aws-chunked` upload with a trailer checksum. R2
     * does not implement trailing checksums, and the failure mode is a confusing
     * protocol error rather than a clear one. `WHEN_REQUIRED` keeps the upload a
     * plain signed PUT, which is what R2 actually supports.
     */
    requestChecksumCalculation: 'WHEN_REQUIRED',
    /**
     * The matching setting for responses. Without it the SDK appends
     * `x-amz-checksum-mode=ENABLED` to every presigned GET, asking R2 for a
     * checksum the object does not have. Nothing here reads checksums — the
     * browser fetches these URLs directly — so the query parameter is pure risk.
     */
    responseChecksumValidation: 'WHEN_REQUIRED',
  });

  return client;
}

/** The bucket, narrowed to a string — only callable once `r2Configured` is true. */
function bucket(): string {
  const name = env.R2_BUCKET_NAME;
  if (!name) throw new Error('R2_BUCKET_NAME is not set');
  return name;
}

// ---------------------------------------------------------------------------
// Object keys
// ---------------------------------------------------------------------------

export interface UploadTarget {
  /** Remote URL to download. */
  sourceUrl: string;
  /** Key prefix below the configured root, e.g. `<userId>/tweets/<tweetId>`. */
  prefix: string;
  /** Stable name within that prefix; makes retries land on the same object. */
  name: string;
}

export interface UploadResult {
  /** The R2 object key. This — not a URL — is what gets persisted. */
  key: string;
  bytes: number;
  contentType: string;
}

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

/**
 * Pick a file extension for a downloaded asset.
 *
 * The extension is derived from what the CDN actually returned rather than from
 * the URL, because X's media URLs frequently carry no usable suffix: an image is
 * `pbs.twimg.com/media/<id>?format=jpg&name=orig`. Content type is consulted
 * first, then the `format` query parameter, then the path.
 *
 * This runs *after* the download, so it is the one thing that makes a retry
 * re-derive the same key — the same URL from the same CDN returns the same
 * content type. A CDN that changed its content type between two attempts would
 * leave one orphaned object; that is a far cheaper failure than guessing an
 * extension that makes the browser download the file instead of rendering it.
 */
function extensionFor(contentType: string | null, sourceUrl: string): string {
  const mapped = contentType ? EXTENSION_BY_CONTENT_TYPE[contentType] : undefined;
  if (mapped) return mapped;

  try {
    const url = new URL(sourceUrl);
    const format = url.searchParams.get('format');
    if (format && /^[a-z0-9]{1,5}$/i.test(format)) return format.toLowerCase();

    const { pathname } = url;
    const dot = pathname.lastIndexOf('.');
    if (dot > -1 && dot > pathname.lastIndexOf('/')) {
      const ext = pathname.slice(dot + 1);
      if (/^[a-z0-9]{1,5}$/i.test(ext)) return ext.toLowerCase();
    }
  } catch {
    // Not a URL we can parse — fall through to the generic extension.
  }

  return 'bin';
}

/** Strip parameters such as `; charset=utf-8` and normalise case. */
function normalizeContentType(raw: string | null): string | null {
  const value = raw?.split(';')[0]?.trim().toLowerCase();
  return value ? value : null;
}

export function tweetMediaPrefix(userId: string, tweetId: string): string {
  return `${userId}/tweets/${tweetId}`;
}

export function avatarPrefix(userId: string): string {
  return `${userId}/avatars`;
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/**
 * Download one remote asset and store it in R2.
 *
 * Two decisions worth naming:
 *
 * 1. **We fetch the bytes ourselves.** Cloudinary could be handed a URL and
 *    would fetch it server-side; the S3 API has no equivalent, so this process
 *    does the download. That moves the bytes through the worker, which is why
 *    the body is streamed rather than buffered — a 100 MB video must not become
 *    a 100 MB Buffer multiplied by the media worker's concurrency. Buffering is
 *    kept only as the fallback for a response with no `Content-Length`, where a
 *    streamed PUT would need chunked encoding we cannot guarantee R2 accepts.
 *
 * 2. **The key is derived from the asset, not the attempt.** `name` is the
 *    caller's stable id (index, or `0-poster`), and the extension is derived
 *    from the response, so a retry overwrites the same object instead of
 *    creating a second copy. Unlike Cloudinary's `overwrite: false` this is a
 *    real overwrite, so a retry costs a re-upload; the alternative would be a
 *    HEAD before every upload, which costs a round trip on the common path to
 *    save one on the rare one.
 */
export async function uploadRemoteAsset(target: UploadTarget): Promise<UploadResult> {
  const s3 = ensureClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(target.sourceUrl, {
      signal: controller.signal,
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`source fetch failed with HTTP ${response.status}`);
    }
    if (!response.body) {
      throw new Error('source fetch returned an empty body');
    }

    const declaredType = normalizeContentType(response.headers.get('content-type'));
    const extension = extensionFor(declaredType, target.sourceUrl);
    // A stored object with no content type is served as a download rather than
    // rendered inline, so fall back to what the extension implies.
    const contentType =
      declaredType ?? CONTENT_TYPE_BY_EXTENSION[extension] ?? 'application/octet-stream';

    const declaredLength = Number(response.headers.get('content-length') ?? '');
    const knownLength = Number.isFinite(declaredLength) && declaredLength > 0 ? declaredLength : null;

    const body =
      knownLength === null
        ? Buffer.from(await response.arrayBuffer())
        : Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
    const bytes = knownLength ?? (body as Buffer).length;

    const key = `${env.R2_ROOT_PREFIX}/${target.prefix}/${target.name}.${extension}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: bucket(),
        Key: key,
        Body: body,
        // Stated explicitly: the SDK cannot infer a length from a stream, and
        // guessing wrong truncates the object.
        ContentLength: bytes,
        ContentType: contentType,
        /**
         * Archived media is immutable — the key contains the tweet id and the
         * asset never changes — so it can be cached indefinitely. This is a
         * private bucket, so only the browser holding the presigned URL is
         * caching it.
         */
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    log.info({ key, bytes, contentType }, 'archived asset to R2');

    return { key, bytes, contentType };
  } catch (err) {
    // Releases the socket if the upload failed part-way through the stream.
    controller.abort();
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * A short-lived presigned GET URL for one object.
 *
 * Returns null rather than throwing when the object has no key or R2 is not
 * configured: callers are serialisers, and a missing media URL is an expected
 * state (media still pending) that the UI already renders. Signing itself is
 * local cryptography with static credentials, so it has no runtime failure mode
 * worth swallowing — a genuine error here should surface, not become a silent
 * `null`.
 *
 * The URL is deliberately never logged: it carries a signature that grants
 * access to the object until it expires.
 */
export async function presignGet(key: string | null | undefined): Promise<string | null> {
  if (!key || !r2Configured) return null;

  return getSignedUrl(
    ensureClient(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn: env.R2_SIGNED_URL_TTL_SECONDS },
  );
}

/** Whether an object actually exists — used by the verification script. */
export async function objectExists(key: string): Promise<boolean> {
  try {
    await ensureClient().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return true;
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return false;
    throw err;
  }
}

/**
 * Remove one object.
 *
 * Not called from any request path: deleting a bookmark deliberately does not
 * touch media (an interactive delete must not depend on a third-party API call).
 * This exists for the eventual orphan sweep.
 */
export async function deleteObject(key: string): Promise<void> {
  try {
    await ensureClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  } catch (err) {
    log.warn({ key, reason: (err as Error).message }, 'failed to delete R2 object');
  }
}

// ---------------------------------------------------------------------------
// X CDN URL helpers (provider-independent)
// ---------------------------------------------------------------------------

/**
 * Ask X for the original-resolution image.
 *
 * X serves `pbs.twimg.com/media/<id>?format=jpg&name=small` on the timeline —
 * a thumbnail. For an archive we want `name=orig`. The URL is rewritten rather
 * than reconstructed so that any other query parameters X adds survive.
 */
export function highestQualityImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)twimg\.com$/.test(parsed.hostname)) return url;
    if (parsed.searchParams.has('name')) parsed.searchParams.set('name', 'orig');
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Strip query strings and sizing suffixes from an avatar URL (`_normal`, `_bigger`). */
export function fullSizeAvatarUrl(url: string): string {
  return url.replace(/_(normal|bigger|mini|200x200|400x400)(\.[a-z]+)(\?.*)?$/i, '$2');
}

export { r2Configured };
