import 'express';

declare global {
  namespace Express {
    interface Request {
      /** Populated by requireAuth. Absent on public routes. */
      auth?: {
        userId: string;
        role: string;
        tokenVersion: number;
      };
      /** Populated by the validate() middleware. */
      valid?: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export {};
