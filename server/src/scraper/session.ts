import { XSession } from '../models/XSession.js';
import { decryptSecret, encryptSecret, DecryptionError } from '../lib/crypto.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('x-session');

/** Playwright's storageState shape. Kept structural to avoid a type import here. */
export interface StorageState {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
}

/**
 * Reads and decrypts a user's X session.
 *
 * Note how narrow this function's exposure is: `encryptedState` is `select:
 * false` on the model, so it must be asked for explicitly here, and the
 * plaintext never leaves this module except into a Playwright context. Nothing
 * in the HTTP layer can reach it.
 */
export async function loadSessionState(userId: string): Promise<StorageState | null> {
  const session = await XSession.findOne({ userId }).select('+encryptedState');
  if (!session) return null;

  try {
    return JSON.parse(decryptSecret(session.encryptedState)) as StorageState;
  } catch (err) {
    if (err instanceof DecryptionError) {
      // Do not log the ciphertext or the key — only that this user's session is
      // unreadable, which is actionable on its own.
      log.error({ userId }, 'stored X session could not be decrypted; marking invalid');
      await markSessionInvalid(userId);
      return null;
    }
    throw err;
  }
}

export async function saveSessionState(
  userId: string,
  state: StorageState,
  xHandle?: string,
): Promise<void> {
  await XSession.findOneAndUpdate(
    { userId },
    {
      $set: {
        encryptedState: encryptSecret(JSON.stringify(state)),
        status: 'active',
        lastValidatedAt: new Date(),
        invalidatedAt: null,
        ...(xHandle ? { xHandle } : {}),
      },
      $setOnInsert: { userId, connectedAt: new Date() },
    },
    { upsert: true, new: true },
  );
  log.info({ userId }, 'X session stored');
}

export async function markSessionInvalid(userId: string): Promise<void> {
  await XSession.updateOne(
    { userId },
    { $set: { status: 'invalid', invalidatedAt: new Date() } },
  );
}

export async function markSessionValid(userId: string): Promise<void> {
  await XSession.updateOne(
    { userId },
    { $set: { status: 'active', lastValidatedAt: new Date(), invalidatedAt: null } },
  );
}

/** Status only — safe to serialise to the frontend. */
export async function getSessionStatus(userId: string) {
  const session = await XSession.findOne({ userId }).lean();
  if (!session) {
    return { connected: false, status: 'disconnected' as const, xHandle: null };
  }
  return {
    connected: session.status === 'active',
    status: session.status,
    xHandle: session.xHandle ?? null,
    connectedAt: session.connectedAt ?? null,
    lastValidatedAt: session.lastValidatedAt ?? null,
  };
}

export async function disconnectSession(userId: string): Promise<void> {
  await XSession.deleteOne({ userId });
  log.info({ userId }, 'X session disconnected');
}
