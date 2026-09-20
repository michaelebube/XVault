import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { env, isProd } from '../../config/env.js';
import { randomToken, sha256 } from '../../lib/crypto.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { unauthorized } from '../../lib/errors.js';
import type { UserDoc } from '../../models/User.js';

export const REFRESH_COOKIE_NAME = 'xv_rt';

/**
 * The cookie is scoped to /api/auth so it is only ever attached to the three
 * endpoints that need it. Combined with SameSite=Lax (which forbids a
 * cross-site POST from carrying it) this removes the need for a separate CSRF
 * token on the refresh endpoint.
 */
const COOKIE_PATH = '/api/auth';

export interface AccessTokenPayload {
  sub: string;
  tv: number;
  role: string;
}

export function signAccessToken(user: UserDoc): string {
  const payload: AccessTokenPayload = {
    sub: String(user._id),
    tv: user.tokenVersion ?? 0,
    role: user.role ?? 'member',
  };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
    issuer: 'xvault',
    audience: 'xvault-api',
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'xvault',
      audience: 'xvault-api',
    }) as AccessTokenPayload;
  } catch {
    throw unauthorized('Access token is invalid or expired');
  }
}

export function refreshExpiryDate(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export interface IssueRefreshOptions {
  userId: string;
  family?: string;
  userAgent?: string;
  ip?: string;
}

/**
 * Refresh tokens are opaque random strings, not JWTs.
 *
 * A JWT would be self-validating but also un-revocable without a blocklist —
 * which is exactly the database row we would end up keeping anyway. Since we
 * need rotation and reuse detection, a random token whose SHA-256 digest is the
 * primary key is simpler and strictly safer: the database never holds anything
 * that can be replayed.
 */
export async function issueRefreshToken(opts: IssueRefreshOptions): Promise<string> {
  const raw = randomToken(48);
  const family = opts.family ?? randomToken(16);

  await RefreshToken.create({
    userId: opts.userId,
    tokenHash: sha256(raw),
    family,
    expiresAt: refreshExpiryDate(),
    userAgent: opts.userAgent?.slice(0, 400),
    ip: opts.ip?.slice(0, 60),
  });

  return raw;
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: env.COOKIE_SAMESITE,
    path: COOKIE_PATH,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: env.COOKIE_SAMESITE,
    path: COOKIE_PATH,
  });
}
