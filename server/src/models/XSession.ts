import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { X_SESSION_STATUSES } from './types.js';

/**
 * A user's authenticated X browser session (Playwright `storageState`).
 *
 * This is credential-adjacent data: whoever holds it can act as the user on X.
 * Therefore:
 *   - `encryptedState` is AES-256-GCM ciphertext, never plaintext (lib/crypto).
 *   - It is `select: false`, so it is never loaded by accident.
 *   - It is never serialised to the frontend — see toJSON below, and note that
 *     the API only ever returns the *status* fields.
 */
const xSessionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    encryptedState: { type: String, required: true, select: false },

    /** The X handle this session belongs to, for display ("Connected as @x"). */
    xHandle: { type: String, trim: true },

    status: { type: String, enum: X_SESSION_STATUSES, default: 'unverified', index: true },
    /** Last time we confirmed the session still loads an authenticated page. */
    lastValidatedAt: { type: Date },
    /** Last time a scrape found the session rejected by X. */
    invalidatedAt: { type: Date },
    connectedAt: { type: Date, default: () => new Date() },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        // Belt and braces: even if some future code does `.select('+encryptedState')`
        // and then serialises the document, the ciphertext does not escape.
        delete ret.encryptedState;
        return ret;
      },
    },
  },
);

export type XSessionAttrs = InferSchemaType<typeof xSessionSchema>;
export type XSessionDoc = HydratedDocument<XSessionAttrs>;

export const XSession = model('XSession', xSessionSchema);
