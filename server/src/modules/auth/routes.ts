import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { validate, body } from '../../middleware/validate.js';
import { currentUserId, requireAuth, requireOwner } from '../../middleware/requireAuth.js';
import { unauthorized } from '../../lib/errors.js';
import { User } from '../../models/User.js';
import {
  changePassword,
  login,
  logout,
  logoutAllDevices,
  register,
  rotateRefreshToken,
} from './service.js';
import {
  REFRESH_COOKIE_NAME,
  clearRefreshCookie,
  setRefreshCookie,
} from './tokens.js';
import { createInvite, listInvites } from './invites.js';

export const authRouter = Router();

/**
 * Credential endpoints are the ones worth brute-forcing, so they get a tighter
 * limit than the rest of the API. Keyed by IP; for a private app behind a small
 * number of households that is sufficient.
 */
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { code: 'too_many_requests', message: 'Too many attempts, try again later' } },
});

const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(200, 'That password is too long');

const registerSchema = z.object({
  email: z.string().email().max(200),
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(80),
  inviteCode: z.string().trim().min(8).max(200),
});

const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

function publicUser(user: {
  _id: unknown;
  email: string;
  displayName: string;
  role?: string | null;
  settings?: unknown;
  createdAt?: Date;
}) {
  return {
    id: String(user._id),
    email: user.email,
    displayName: user.displayName,
    role: user.role ?? 'member',
    settings: user.settings ?? {},
    createdAt: user.createdAt,
  };
}

function requestMeta(req: Request) {
  return { userAgent: req.get('user-agent') ?? undefined, ip: req.ip };
}

authRouter.post(
  '/register',
  credentialLimiter,
  validate({ body: registerSchema }),
  async (req: Request, res: Response) => {
    const input = body<z.infer<typeof registerSchema>>(req);
    const result = await register({ ...input, ...requestMeta(req) });
    setRefreshCookie(res, result.refreshToken);
    res.status(201).json({
      user: publicUser(result.user),
      accessToken: result.accessToken,
    });
  },
);

authRouter.post(
  '/login',
  credentialLimiter,
  validate({ body: loginSchema }),
  async (req: Request, res: Response) => {
    const input = body<z.infer<typeof loginSchema>>(req);
    const result = await login({ ...input, ...requestMeta(req) });
    setRefreshCookie(res, result.refreshToken);
    res.json({ user: publicUser(result.user), accessToken: result.accessToken });
  },
);

authRouter.post('/refresh', async (req: Request, res: Response) => {
  const raw = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
  if (!raw) throw unauthorized('No session cookie');

  try {
    const result = await rotateRefreshToken(raw, requestMeta(req));
    setRefreshCookie(res, result.refreshToken);
    res.json({ user: publicUser(result.user), accessToken: result.accessToken });
  } catch (err) {
    // A failed refresh should not leave a dead cookie behind that the client
    // keeps retrying with.
    clearRefreshCookie(res);
    throw err;
  }
});

authRouter.post('/logout', async (req: Request, res: Response) => {
  await logout(req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined);
  clearRefreshCookie(res);
  res.status(204).end();
});

authRouter.post('/logout-all', requireAuth, async (req: Request, res: Response) => {
  await logoutAllDevices(currentUserId(req));
  clearRefreshCookie(res);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  const user = await User.findById(currentUserId(req)).lean();
  if (!user) throw unauthorized();
  res.json({ user: publicUser(user) });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});

authRouter.post(
  '/change-password',
  requireAuth,
  credentialLimiter,
  validate({ body: changePasswordSchema }),
  async (req: Request, res: Response) => {
    const input = body<z.infer<typeof changePasswordSchema>>(req);
    await changePassword(currentUserId(req), input.currentPassword, input.newPassword);
    clearRefreshCookie(res);
    res.status(204).end();
  },
);

// --- Invites (owner only) ---------------------------------------------------

const createInviteSchema = z.object({
  label: z.string().trim().max(120).optional(),
  expiresInDays: z.number().int().min(1).max(365).default(14),
});

authRouter.post(
  '/invites',
  requireAuth,
  requireOwner,
  validate({ body: createInviteSchema }),
  async (req: Request, res: Response) => {
    const input = body<z.infer<typeof createInviteSchema>>(req);
    const invite = await createInvite({ ...input, createdBy: currentUserId(req) });
    // The raw code is returned exactly once, here. Only its digest is stored.
    res.status(201).json(invite);
  },
);

authRouter.get('/invites', requireAuth, requireOwner, async (_req, res: Response) => {
  res.json({ invites: await listInvites() });
});
