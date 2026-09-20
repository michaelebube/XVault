import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from './logger.js';

let connected = false;

export async function connectDatabase(): Promise<typeof mongoose> {
  if (connected) return mongoose;

  // Surfaces mistakes like `Tweet.find({ userid })` (wrong case) as errors
  // instead of silently returning every document in the collection — which,
  // in a multi-user app, would be a data-isolation bug.
  mongoose.set('strictQuery', true);

  /**
   * `sanitizeFilter` is deliberately NOT enabled.
   *
   * It wraps every object-valued filter in `$eq`, so a legitimate operator
   * query such as `{ status: { $in: ['active', 'unverified'] } }` becomes
   * `{ status: { $eq: { $in: [...] } } }` and throws a CastError at runtime.
   * That breaks boot-time schedule reconciliation, the sync lock, invite
   * redemption and the media sweep.
   *
   * The protection it offers — query-selector injection through a raw request
   * value — is already handled earlier and more precisely: every body, query
   * and param is parsed by zod in middleware/validate.ts, so filters only ever
   * receive primitives, Dates and ObjectIds, never attacker-shaped objects.
   */

  await mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DB_NAME,
    serverSelectionTimeoutMS: 10_000,
  });

  connected = true;
  logger.info({ db: env.MONGODB_DB_NAME }, 'MongoDB connected');

  mongoose.connection.on('disconnected', () => {
    connected = false;
    logger.warn('MongoDB disconnected');
  });
  mongoose.connection.on('error', (err) => {
    logger.error({ err }, 'MongoDB connection error');
  });

  return mongoose;
}

export async function disconnectDatabase(): Promise<void> {
  if (!connected) return;
  await mongoose.disconnect();
  connected = false;
}
