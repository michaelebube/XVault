import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { AppError, notFound } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { isProd } from '../config/env.js';

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(notFound('No such endpoint'));
}

/**
 * Single place where an error becomes a response.
 *
 * Rule: only `AppError`s marked `expose` reveal their message. Everything else
 * — driver errors, storage responses, programming mistakes — becomes a
 * generic 500. Scraped content and internal state must never leak through an
 * error string.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  let status = 500;
  let code = 'internal_error';
  let message = 'Something went wrong on our end';
  let details: unknown;

  if (err instanceof AppError) {
    status = err.status;
    code = err.code;
    if (err.expose) {
      message = err.message;
      details = err.details;
    }
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    code = 'bad_request';
    message = 'Some of the supplied values are not valid';
    details = Object.entries(err.errors).map(([field, e]) => ({
      field,
      message: e.message,
    }));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    code = 'bad_request';
    message = 'Malformed identifier';
  } else if (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: number }).code === 11000
  ) {
    status = 409;
    code = 'conflict';
    message = 'That already exists';
  }

  const logPayload = {
    err,
    status,
    code,
    method: req.method,
    path: req.originalUrl,
    userId: req.auth?.userId,
  };

  if (status >= 500) logger.error(logPayload, 'request failed');
  else logger.debug(logPayload, 'request rejected');

  res.status(status).json({
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      // Stack traces are a development affordance only.
      ...(!isProd && status >= 500 && err instanceof Error ? { stack: err.stack } : {}),
    },
  });
}
