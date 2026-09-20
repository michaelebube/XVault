import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    /**
     * `select: false` means the hash is never loaded unless a query explicitly
     * asks for it. Defence in depth: even if some route forgets to project
     * fields, it cannot accidentally serialise the hash to the client.
     */
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, required: true, trim: true, maxlength: 80 },
    role: { type: String, enum: ['owner', 'member'], default: 'member' },

    /**
     * Bumping this invalidates every access AND refresh token already issued to
     * the user, without needing to find and delete individual token rows.
     * Used on password change and "sign out everywhere".
     */
    tokenVersion: { type: Number, default: 0 },

    settings: {
      /**
       * AGENT.md §16: AI suggests, human confirms. Auto-apply is opt-in and
       * must never be the default.
       */
      aiAutoApply: { type: Boolean, default: false },
      theme: { type: String, enum: ['system', 'light', 'dark'], default: 'system' },
    },

    lastLoginAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        return ret;
      },
    },
  },
);

export type UserAttrs = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserAttrs>;

export const User = model('User', userSchema);
