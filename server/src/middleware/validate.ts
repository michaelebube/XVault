import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny } from 'zod';
import { badRequest } from '../lib/errors.js';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validates and *replaces* the request parts with the parsed result, so handlers
 * work with typed, coerced, stripped data instead of raw `any` from the wire.
 *
 * Express 5 makes `req.query` a getter, so we cannot assign to it; parsed values
 * are exposed on `req.valid` instead and read through the `validated()` helper.
 */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      req.valid = {
        body: schemas.body ? schemas.body.parse(req.body) : undefined,
        query: schemas.query ? schemas.query.parse(req.query) : undefined,
        params: schemas.params ? schemas.params.parse(req.params) : undefined,
      };
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(
          badRequest(
            'Some of the supplied values are not valid',
            err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
          ),
        );
        return;
      }
      next(err);
    }
  };
}

export function body<T>(req: Request): T {
  return req.valid?.body as T;
}
export function query<T>(req: Request): T {
  return req.valid?.query as T;
}
export function params<T>(req: Request): T {
  return req.valid?.params as T;
}
