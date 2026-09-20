import type { NextFunction, Request, Response } from 'express';
import { unauthorized, forbidden } from '../lib/errors.js';
import { verifyAccessToken } from '../modules/auth/tokens.js';

/**
 * Verifies the bearer access token and attaches `req.auth`.
 *
 * Deliberately stateless: no database read per request. The cost is that a
 * revoked user keeps access until their current access token expires (15
 * minutes), because tokenVersion is only re-checked at refresh time. For a
 * private, invite-only app that window is an acceptable trade for not adding a
 * user lookup to every single request. If instant revocation ever matters,
 * the fix is a small Redis set of banned (userId, tokenVersion) pairs rather
 * than a Mongo read.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(unauthorized('Missing access token'));
    return;
  }

  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length).trim());
    req.auth = { userId: payload.sub, role: payload.role, tokenVersion: payload.tv };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireOwner(req: Request, _res: Response, next: NextFunction): void {
  if (req.auth?.role !== 'owner') {
    next(forbidden('This action is restricted to the account owner'));
    return;
  }
  next();
}

/**
 * The single accessor every route uses to get the caller's id.
 *
 * Every user-owned query in this codebase is filtered by the value returned
 * here (AGENT.md §7). Making it a throwing helper rather than an optional field
 * means a handler cannot quietly build a query with `userId: undefined` — which
 * in Mongo would match documents where the field is absent, not "no documents".
 */
export function currentUserId(req: Request): string {
  if (!req.auth?.userId) throw unauthorized();
  return req.auth.userId;
}
