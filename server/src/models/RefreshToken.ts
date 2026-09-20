import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * One row per issued refresh token, so a single device can be revoked without
 * signing the user out everywhere.
 *
 * Rotation + reuse detection:
 *   - Every /refresh issues a new token and marks the old one `rotatedTo`.
 *   - If a token that was already rotated is presented again, that means either
 *     a stolen token or a replayed one. We then revoke the whole `family`,
 *     because we cannot tell the thief from the victim.
 *
 * `family` is the id of the token created at login; every descendant inherits
 * it, so revoking a family kills one device's entire chain.
 */
const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    /** SHA-256 of the opaque token. The raw token only ever exists in the cookie. */
    tokenHash: { type: String, required: true, unique: true, index: true },
    family: { type: String, required: true, index: true },

    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: {
      type: String,
      enum: ['logout', 'rotated', 'reuse_detected', 'password_change', 'admin'],
      default: null,
    },
    rotatedTo: { type: String, default: null },

    userAgent: { type: String, maxlength: 400 },
    ip: { type: String, maxlength: 60 },
  },
  { timestamps: true },
);

// Let MongoDB reap expired tokens for us. The TTL monitor runs about once a
// minute, so this is cleanup, not an authorisation check — expiry is still
// verified in code on every refresh.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RefreshTokenAttrs = InferSchemaType<typeof refreshTokenSchema>;
export type RefreshTokenDoc = HydratedDocument<RefreshTokenAttrs>;

export const RefreshToken = model('RefreshToken', refreshTokenSchema);
