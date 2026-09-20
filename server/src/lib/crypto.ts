import crypto from 'node:crypto';
import { env } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12; // 96-bit nonce, the size GCM is specified for
const KEY = Buffer.from(env.SESSION_ENCRYPTION_KEY, 'base64');

/**
 * Envelope format: v1.<iv>.<authTag>.<ciphertext>, all base64url.
 *
 * The version prefix exists so we can rotate algorithms later without having to
 * guess how an old row was encrypted.
 *
 * AES-256-**GCM** (not CBC) because GCM is authenticated: decryption fails loudly
 * if the ciphertext was tampered with. For credential-adjacent data like an X
 * session, silently decrypting attacker-modified bytes would be worse than an
 * error.
 */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    'v1',
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecryptionError';
  }
}

export function decryptSecret(envelope: string): string {
  const parts = envelope.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new DecryptionError('Unrecognised ciphertext envelope');
  }
  const [, ivB64, tagB64, dataB64] = parts as [string, string, string, string];

  try {
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      KEY,
      Buffer.from(ivB64, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  } catch {
    // Most likely cause: SESSION_ENCRYPTION_KEY changed. Never echo the
    // ciphertext or the key into the error.
    throw new DecryptionError(
      'Failed to decrypt session state (wrong SESSION_ENCRYPTION_KEY or corrupted data)',
    );
  }
}

/** Opaque, URL-safe random token (invite codes, refresh token IDs). */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * SHA-256 of a high-entropy token. Used for refresh tokens and invite codes:
 * they are already random, so a slow password hash buys nothing, but storing a
 * digest means a database leak does not hand over usable tokens.
 */
export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Constant-time string comparison, for comparing digests. */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
