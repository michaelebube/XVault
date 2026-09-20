import { InviteCode } from '../../models/InviteCode.js';
import { randomToken, sha256 } from '../../lib/crypto.js';

export interface CreateInviteInput {
  label?: string;
  expiresInDays: number;
  createdBy?: string;
}

export async function createInvite(input: CreateInviteInput) {
  // Grouped for legibility when typing it into a form: XV-xxxx-xxxx-xxxx
  const raw = `XV-${randomToken(12).replace(/[-_]/g, '').slice(0, 16).toUpperCase()}`;

  const doc = await InviteCode.create({
    codeHash: sha256(raw),
    label: input.label,
    createdBy: input.createdBy,
    expiresAt: new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000),
  });

  return {
    id: String(doc._id),
    /** Returned once. It is not recoverable afterwards — only the digest is stored. */
    code: raw,
    label: doc.label,
    expiresAt: doc.expiresAt,
  };
}

export async function listInvites() {
  const docs = await InviteCode.find()
    .sort({ createdAt: -1 })
    .limit(100)
    .populate('usedBy', 'email displayName')
    .lean();

  return docs.map((d) => ({
    id: String(d._id),
    label: d.label ?? null,
    used: Boolean(d.usedBy),
    usedBy: d.usedBy
      ? {
          email: (d.usedBy as unknown as { email: string }).email,
          displayName: (d.usedBy as unknown as { displayName: string }).displayName,
        }
      : null,
    expiresAt: d.expiresAt,
    expired: d.expiresAt.getTime() < Date.now(),
    createdAt: d.createdAt,
  }));
}
