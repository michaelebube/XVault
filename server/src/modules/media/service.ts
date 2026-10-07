import { Tweet } from '../../models/Tweet.js';
import type { MediaStatus } from '../../models/types.js';
import { childLogger } from '../../lib/logger.js';
import { r2Configured } from '../../config/env.js';
import {
  avatarPrefix,
  fullSizeAvatarUrl,
  highestQualityImageUrl,
  tweetMediaPrefix,
  uploadRemoteAsset,
} from './r2.js';

const log = childLogger('media');

export interface MediaArchiveResult {
  tweetId: string;
  archived: number;
  failed: number;
  skipped: number;
  status: MediaStatus;
}

/**
 * Archive every outstanding asset on one bookmark.
 *
 * Media archival is a **separate job from scraping**, and this is the reason:
 * uploads are the slowest and most failure-prone part of the pipeline, and a
 * storage outage must not turn a successful scrape into a failed one. The tweet
 * text is already safely in MongoDB by the time this runs; if it fails, the
 * bookmark is still browsable and the media job retries on its own.
 *
 * Each asset is handled independently. One dead image does not prevent the
 * other three from being archived, which is why the tweet ends in `partial`
 * rather than `failed` when only some succeed.
 */
export async function archiveMediaForTweet(id: string): Promise<MediaArchiveResult> {
  const tweet = await Tweet.findById(id);
  if (!tweet) {
    return { tweetId: id, archived: 0, failed: 0, skipped: 0, status: 'none' };
  }

  if (!r2Configured) {
    log.warn({ tweetId: tweet.tweetId }, 'R2 not configured — skipping media archival');
    return { tweetId: tweet.tweetId, archived: 0, failed: 0, skipped: 1, status: 'pending' };
  }

  const userId = String(tweet.userId);
  const prefix = tweetMediaPrefix(userId, tweet.tweetId);

  let archived = 0;
  let failed = 0;
  let skipped = 0;

  for (const [index, item] of tweet.media.entries()) {
    if (item.status === 'archived') {
      skipped += 1;
      continue;
    }

    item.attempts += 1;

    try {
      // Videos: archive the poster frame first. It is always a plain image and
      // always succeeds, so even when the video itself is unreachable the card
      // still has something to render.
      if (item.posterSourceUrl && !item.posterStorageKey) {
        const poster = await uploadRemoteAsset({
          sourceUrl: highestQualityImageUrl(item.posterSourceUrl),
          prefix,
          name: `${index}-poster`,
        });
        item.posterStorageKey = poster.key;
      }

      const isVideoAsset = item.kind !== 'image';
      const sourceUrl =
        item.kind === 'image' ? highestQualityImageUrl(item.sourceUrl) : item.sourceUrl;

      // A "video" whose only real source was its poster (see the scraper note
      // about MSE/blob: URLs) is archived as far as it can be: we have the
      // poster, there is nothing else to fetch.
      const posterIsTheOnlySource = isVideoAsset && item.sourceUrl === item.posterSourceUrl;

      if (posterIsTheOnlySource) {
        item.storageKey = item.posterStorageKey;
        item.status = 'archived';
        item.failureReason = 'video stream not directly downloadable; poster frame archived';
        archived += 1;
        continue;
      }

      const upload = await uploadRemoteAsset({
        sourceUrl,
        prefix,
        name: String(index),
      });

      item.storageKey = upload.key;
      item.status = 'archived';
      item.failureReason = null;
      archived += 1;
    } catch (err) {
      item.status = 'failed';
      item.failureReason = truncate((err as Error).message, 300);
      failed += 1;
      log.warn(
        { tweetId: tweet.tweetId, index, attempts: item.attempts, reason: item.failureReason },
        'media asset archival failed',
      );
    }
  }

  // The avatar is archived alongside the media (AGENT.md §13 requires it rather
  // than relying on X's URL, which rotates whenever the user changes their
  // picture and would leave old bookmarks with broken avatars).
  if (tweet.author.avatarSourceUrl && !tweet.author.avatarStorageKey) {
    try {
      const upload = await uploadRemoteAsset({
        sourceUrl: fullSizeAvatarUrl(tweet.author.avatarSourceUrl),
        prefix: avatarPrefix(userId),
        // Keyed by handle, not tweet: one upload serves every bookmark from
        // that author instead of one copy per tweet.
        name: sanitizeKeySegment(tweet.author.handle || tweet.tweetId),
      });
      tweet.author.avatarStorageKey = upload.key;
    } catch (err) {
      log.warn(
        { tweetId: tweet.tweetId, reason: (err as Error).message },
        'avatar archival failed — falling back to the X URL',
      );
    }
  }

  tweet.mediaStatus = resolveStatus(tweet.media.length, archived + skipped, failed);
  tweet.mediaAttempts += 1;
  await tweet.save();

  log.info(
    { tweetId: tweet.tweetId, archived, failed, skipped, status: tweet.mediaStatus },
    'media archival finished',
  );

  return { tweetId: tweet.tweetId, archived, failed, skipped, status: tweet.mediaStatus };
}

function resolveStatus(total: number, ok: number, failed: number): MediaStatus {
  if (total === 0) return 'none';
  if (failed === 0) return 'complete';
  if (ok === 0) return 'failed';
  return 'partial';
}

/**
 * Bookmarks whose media still needs work.
 *
 * `mediaAttempts` caps the retries: after `maxAttempts` passes we stop trying
 * so a permanently dead CDN URL cannot occupy the queue forever. The bookmark
 * itself stays in the archive — only its media is given up on.
 */
export async function findTweetsNeedingMedia(
  limit: number,
  maxAttempts = 4,
): Promise<string[]> {
  const docs = await Tweet.find({
    mediaStatus: { $in: ['pending', 'partial', 'failed'] },
    mediaAttempts: { $lt: maxAttempts },
  })
    .select('_id')
    .sort({ mediaAttempts: 1, archivedAt: -1 })
    .limit(limit)
    .lean();

  return docs.map((d) => String(d._id));
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * S3 object keys are a flat namespace, so a `/` in a segment would silently
 * create a nested prefix and could be used to escape the intended prefix.
 * Everything outside `[A-Za-z0-9_-]` is therefore replaced.
 */
function sanitizeKeySegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100) || 'unknown';
}
