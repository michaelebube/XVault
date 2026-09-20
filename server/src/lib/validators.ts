import { z } from 'zod';

/** A 24-char hex Mongo ObjectId. Rejects everything else before it reaches Mongoose. */
export const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'must be a valid id');

export const idParams = z.object({ id: objectId });

/** `?flag=true|false|1|0`, absent means "no filter" rather than false. */
export const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');
