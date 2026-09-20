import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env, isProd } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/routes.js';
import { categoriesRouter } from './modules/categories/routes.js';
import { bookmarksRouter } from './modules/bookmarks/routes.js';
import { syncRouter } from './modules/sync/routes.js';
import { xAccountRouter } from './modules/xaccount/routes.js';

export function createApp() {
  const app = express();

  /**
   * Express 5 forwards rejected promises from async handlers to the error
   * middleware automatically, so there is no asyncHandler wrapper anywhere in
   * this codebase. That is the main reason for choosing v5 here.
   */

  // Behind a reverse proxy in production, so req.ip / secure cookies work.
  if (isProd) app.set('trust proxy', 1);

  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves JSON only; the Nuxt app sets its own CSP for the HTML it
      // renders. A restrictive CSP here would only affect error pages.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      // Required for the refresh cookie to travel with fetch().
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
  );

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'xvault-api', time: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api/bookmarks', bookmarksRouter);
  app.use('/api/sync', syncRouter);
  app.use('/api/x-account', xAccountRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
