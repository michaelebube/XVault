import { pino } from 'pino';
import { env, isProd } from '../config/env.js';

/**
 * Redaction is a hard requirement, not a nicety: AGENT.md §8 forbids X session
 * state from ever reaching normal logs. Rather than trusting every call site to
 * remember that, we strip these keys centrally. Anything credential-adjacent
 * that might be attached to a log object gets replaced with [redacted].
 */
const redactPaths = [
  'password',
  '*.password',
  'passwordHash',
  '*.passwordHash',
  'token',
  '*.token',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'authorization',
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.cookie',
  'cookies',
  '*.cookies',
  'storageState',
  '*.storageState',
  'encryptedState',
  '*.encryptedState',
  'sessionState',
  '*.sessionState',
  'auth_token',
  '*.auth_token',
  'SESSION_ENCRYPTION_KEY',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'accessKeyId',
  '*.accessKeyId',
  'secretAccessKey',
  '*.secretAccessKey',
  'credentials',
  '*.credentials',
  'ANTHROPIC_API_KEY',
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: { paths: redactPaths, censor: '[redacted]' },
  base: undefined,
  ...(isProd
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
});

export type Logger = typeof logger;

/** Child logger tagged with a subsystem name, e.g. `scraper`, `worker:sync`. */
export function childLogger(name: string, extra: Record<string, unknown> = {}): Logger {
  return logger.child({ name, ...extra });
}
