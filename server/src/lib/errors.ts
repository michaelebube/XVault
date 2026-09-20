/**
 * Errors that are safe to show a user carry `expose: true`. Everything else is
 * reported as a generic 500 so internal details (stack traces, driver messages,
 * storage responses) never leak through the API.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly expose: boolean;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    options: { expose?: boolean; details?: unknown; cause?: unknown } = {},
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.expose = options.expose ?? status < 500;
    this.details = options.details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'bad_request', message, { details });

export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'unauthorized', message);

export const forbidden = (message = 'You do not have access to this resource') =>
  new AppError(403, 'forbidden', message);

export const notFound = (message = 'Not found') => new AppError(404, 'not_found', message);

export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'conflict', message, { details });

export const tooManyRequests = (message = 'Too many requests') =>
  new AppError(429, 'too_many_requests', message);

export const internal = (message: string, cause?: unknown) =>
  new AppError(500, 'internal_error', message, { expose: false, cause });
