import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

/**
 * Invite-based registration (AGENT.md §5): there is no public signup. Only the
 * digest of the code is stored, so a database leak does not hand out working
 * invites.
 */
const inviteCodeSchema = new Schema(
  {
    codeHash: { type: String, required: true, unique: true, index: true },
    /** Shown in the admin listing so you can tell invites apart. */
    label: { type: String, trim: true, maxlength: 120 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    usedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    usedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

export type InviteCodeAttrs = InferSchemaType<typeof inviteCodeSchema>;
export type InviteCodeDoc = HydratedDocument<InviteCodeAttrs>;

export const InviteCode = model('InviteCode', inviteCodeSchema);
