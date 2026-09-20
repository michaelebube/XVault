import { Redis } from 'ioredis';
import { env } from '../config/env.js';

/**
 * ioredis is CommonJS and has no real default export, so under NodeNext
 * `import IORedis from 'ioredis'` resolves to the module namespace — usable as
 * a value but not as a constructor or a type. The named `Redis` export is both
 * the class and its instance type, which is what we actually want here.
 *
 * BullMQ requires `maxRetriesPerRequest: null` on the connection it blocks on,
 * otherwise long-lived blocking commands (BRPOPLPUSH) get killed by ioredis'
 * retry cap and workers die with confusing errors.
 *
 * We keep one shared connection for producers (queues) and let each Worker
 * create its own, because a blocking worker connection cannot also serve
 * ordinary commands.
 */
export function createRedisConnection(): Redis {
  return new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

let shared: Redis | null = null;

export function getSharedRedis(): Redis {
  if (!shared) shared = createRedisConnection();
  return shared;
}

export async function closeSharedRedis(): Promise<void> {
  if (shared) {
    await shared.quit();
    shared = null;
  }
}
