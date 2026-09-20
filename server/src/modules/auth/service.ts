import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { InviteCode } from '../../models/InviteCode.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { User, type UserDoc } from '../../models/User.js';
import { sha256 } from '../../lib/crypto.js';
import { badRequest, conflict, unauthorized } from '../../lib/errors.js';
import { childLogger } from '../../lib/logger.js';
import { issueRefreshToken, refreshExpiryDate, signAccessToken } from './tokens.js';

const log = childLogger('auth');

/** Cost 12 ≈ 250ms on typical hardware: slow enough to matter, fast enough to log in. */
const BCRYPT_ROUNDS = 12;

export interface AuthResult {
  user: UserDoc;
  accessToken: string;
  refreshToken: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  inviteCode: string;
  userAgent?: string;
  ip?: string;
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const codeHash = sha256(input.inviteCode.trim());

  // Atomically claim the invite: findOneAndUpdate with `usedBy: null` in the
  // filter means two simultaneous registrations cannot both consume one invite.
  // The user is created afterwards; if that fails we release the invite.
  const invite = await InviteCode.findOneAndUpdate(
    { codeHash, usedBy: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } },
    { new: true },
  );

  if (!invite) {
    // Same message for "wrong code" and "already used" so the endpoint cannot
    // be used to probe which invite codes exist.
    throw badRequest('That invite code is not valid or has already been used');
  }

  const email = input.email.trim().toLowerCase();
  const existing = await User.findOne({ email }).lean();
  if (existing) {
    await InviteCode.updateOne({ _id: invite._id }, { $set: { usedAt: null } });
    throw conflict('An account with that email already exists');
  }

  let user: UserDoc;
  try {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    // First account created becomes the owner; everyone else is a member.
    const isFirstUser = (await User.estimatedDocumentCount()) === 0;
    user = await User.create({
      email,
      passwordHash,
      displayName: input.displayName.trim(),
      role: isFirstUser ? 'owner' : 'member',
    });
  } catch (err) {
    await InviteCode.updateOne({ _id: invite._id }, { $set: { usedAt: null } });
    throw err;
  }

  await InviteCode.updateOne({ _id: invite._id }, { $set: { usedBy: user._id } });

  log.info({ userId: String(user._id) }, 'user registered');
  return issueSession(user, input.userAgent, input.ip);
}

export interface LoginInput {
  email: string;
  password: string;
  userAgent?: string;
  ip?: string;
}

export async function login(input: LoginInput): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const user = await User.findOne({ email }).select('+passwordHash');

  if (!user) {
    // Hash anyway so a missing account and a wrong password take the same time.
    // Without this, response timing tells an attacker which emails are registered.
    await bcrypt.compare(input.password, '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
    throw unauthorized('Incorrect email or password');
  }

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) throw unauthorized('Incorrect email or password');

  user.lastLoginAt = new Date();
  await user.save();

  return issueSession(user, input.userAgent, input.ip);
}

async function issueSession(
  user: UserDoc,
  userAgent?: string,
  ip?: string,
): Promise<AuthResult> {
  const refreshToken = await issueRefreshToken({
    userId: String(user._id),
    userAgent,
    ip,
  });
  return { user, accessToken: signAccessToken(user), refreshToken };
}

/**
 * Rotate a refresh token.
 *
 * Every successful refresh consumes the presented token and issues a new one in
 * the same family. If a token that was *already* rotated is presented again,
 * the only explanations are a stolen token being replayed or the legitimate
 * client replaying an old one. We cannot tell which, so we revoke the entire
 * family — the device has to log in again. That is the standard
 * refresh-token-rotation-with-reuse-detection pattern, and it turns a silent
 * long-lived compromise into a visible logout.
 */
export async function rotateRefreshToken(
  rawToken: string,
  meta: { userAgent?: string; ip?: string } = {},
): Promise<AuthResult> {
  const tokenHash = sha256(rawToken);
  const existing = await RefreshToken.findOne({ tokenHash });

  if (!existing) throw unauthorized('Session expired, please sign in again');

  if (existing.revokedAt || existing.rotatedTo) {
    log.warn(
      { userId: String(existing.userId), family: existing.family },
      'refresh token reuse detected - revoking family',
    );
    await RefreshToken.updateMany(
      { family: existing.family, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: 'reuse_detected' } },
    );
    throw unauthorized('Session expired, please sign in again');
  }

  if (existing.expiresAt.getTime() <= Date.now()) {
    throw unauthorized('Session expired, please sign in again');
  }

  const user = await User.findById(existing.userId);
  if (!user) throw unauthorized('Session expired, please sign in again');

  const newRaw = await issueRefreshToken({
    userId: String(user._id),
    family: existing.family,
    userAgent: meta.userAgent,
    ip: meta.ip,
  });

  existing.rotatedTo = sha256(newRaw);
  existing.revokedAt = new Date();
  existing.revokedReason = 'rotated';
  await existing.save();

  return { user, accessToken: signAccessToken(user), refreshToken: newRaw };
}

/** Revoke one device's chain. */
export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  const existing = await RefreshToken.findOne({ tokenHash: sha256(rawToken) });
  if (!existing) return;
  await RefreshToken.updateMany(
    { family: existing.family, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: 'logout' } },
  );
}

/**
 * Sign out everywhere. Bumping tokenVersion invalidates outstanding access
 * tokens too — though only as they are next verified, which is why access
 * tokens are short-lived.
 */
export async function logoutAllDevices(userId: string): Promise<void> {
  await Promise.all([
    User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } }),
    RefreshToken.updateMany(
      { userId: new mongoose.Types.ObjectId(userId), revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: 'admin' } },
    ),
  ]);
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw unauthorized();

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) throw badRequest('Current password is incorrect');

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();

  await RefreshToken.updateMany(
    { userId: user._id, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: 'password_change' } },
  );
}

export { refreshExpiryDate };
