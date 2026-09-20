import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { CATEGORY_CREATORS } from './types.js';

const categorySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    /** Lowercased name; the uniqueness key, so "AI" and "ai" cannot coexist. */
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 280, default: '' },
    /**
     * A token name from the frontend palette (`indigo`, `amber`, ...), not a raw
     * hex value. Keeping it symbolic means categories stay readable when the
     * theme changes, and light/dark each pick their own shade — DESIGN.md §17.
     */
    color: { type: String, default: 'neutral', maxlength: 24 },
    createdBy: { type: String, enum: CATEGORY_CREATORS, default: 'manual' },

    /** Denormalised counter kept in step by the bookmark service. */
    bookmarkCount: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Categories are per-user (AGENT.md §15): two different users may each have an
// "AI" category, but one user cannot have two.
categorySchema.index({ userId: 1, slug: 1 }, { unique: true });

export type CategoryAttrs = InferSchemaType<typeof categorySchema>;
export type CategoryDoc = HydratedDocument<CategoryAttrs>;

export const Category = model('Category', categorySchema);
