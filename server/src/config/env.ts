import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// src/config -> src -> server
const serverRoot = path.resolve(here, '..', '..');

loadDotenv({ path: path.join(serverRoot, '.env') });

/**
 * A 32-byte key, base64 encoded. Used for AES-256-GCM encryption of X session
 * state at rest. Generate with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
const base64Key32 = z
  .string()
  .refine((v) => {
    try {
      return Buffer.from(v, 'base64').length === 32;
    } catch {
      return false;
    }
  }, 'must be a base64-encoded 32-byte key');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  PORT: z.coerce.number().int().positive().default(4000),
  /** Origin of the Nuxt app, used for CORS + cookie sameSite decisions. */
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),

  MONGODB_URI: z.string().min(1),
  MONGODB_DB_NAME: z.string().min(1).default('xvault'),

  REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6379'),

  // --- Auth -----------------------------------------------------------------
  JWT_ACCESS_SECRET: z.string().min(32, 'use at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'use at least 32 chars'),
  /** Short-lived on purpose: a leaked access token expires quickly. */
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /**
   * 'lax' is correct whenever the web app and API share a registrable domain
   * (including localhost:3000 -> localhost:4000, since ports do not affect
   * "site"). Only set 'none' for a genuinely cross-site deployment, and note
   * that 'none' requires secure cookies, i.e. HTTPS.
   */
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),

  // --- X session encryption -------------------------------------------------
  SESSION_ENCRYPTION_KEY: base64Key32,

  // --- Scraping -------------------------------------------------------------
  SCRAPE_INTERVAL_HOURS: z.coerce.number().positive().default(72),
  SCRAPE_HEADLESS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  /** Safety valve: never walk more than this many bookmarks in one run. */
  SCRAPE_MAX_BOOKMARKS_PER_RUN: z.coerce.number().int().positive().default(1000),
  /**
   * During an incremental run, stop after seeing this many consecutive
   * already-archived tweets. See docs in scraper/bookmarkScraper.ts.
   */
  SCRAPE_KNOWN_STREAK_STOP: z.coerce.number().int().positive().default(25),

  // --- Cloudflare R2 (optional so the API can boot before media is configured) --
  /**
   * R2 is reached through its S3-compatible API, so the endpoint is derived from
   * the account id rather than configured separately:
   *   https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
   */
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  /** Key prefix for everything this application stores, e.g. `xvault/<userId>/...`. */
  R2_ROOT_PREFIX: z.string().default('xvault'),
  /**
   * Lifetime of a presigned GET URL. The bucket is private, so every media URL
   * the UI renders is signed and expires. Long enough that a library tab left
   * open keeps rendering its images, short enough that a leaked URL is not a
   * permanent grant.
   */
  R2_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(6 * 60 * 60),

  // --- AI categorization (optional) ----------------------------------------
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-sonnet-5'),
  /** Cosine similarity above which we suggest an existing category outright. */
  AI_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.82),
  /** Skip AI re-suggestion for a bookmark a human touched within this window. */
  AI_HUMAN_EDIT_LOCK_MINUTES: z.coerce.number().int().positive().default(60 * 24),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  // Deliberately not using the logger: config is what the logger is built from.
  console.error(`Invalid environment configuration:\n${issues}\n`);
  console.error('Copy server/.env.example to server/.env and fill it in.');
  process.exit(1);
}

export const env = parsed.data;

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

export const r2Configured = Boolean(
  env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET_NAME,
);

export const aiConfigured = Boolean(env.ANTHROPIC_API_KEY);
