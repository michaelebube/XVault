import type { ApiErrorBody, AuthResponse } from '~/types/api';

/** A server error that reached the client with its envelope intact. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: Record<string, unknown>;
  query?: Record<string, string | number | boolean | undefined>;
  /** Used by the refresh call itself, to avoid refreshing a refresh. */
  skipRefresh?: boolean;
}

/**
 * One refresh at a time, shared by every caller.
 *
 * Module scope is safe here precisely because this app is client-only
 * (`ssr: false`): there is one browser tab per module instance, so this can
 * never leak one user's refresh into another's request — the classic hazard of
 * module-level state in an SSR app.
 *
 * Without it, a page that fires five requests on mount would, on an expired
 * token, send five refreshes. Since refresh tokens rotate and reuse is treated
 * as theft, four of those would present an already-rotated token and the server
 * would correctly kill the whole family — logging the user out for being
 * normal.
 */
let refreshInFlight: Promise<boolean> | null = null;

function toApiError(err: unknown): ApiError {
  const e = err as { status?: number; statusCode?: number; data?: ApiErrorBody };
  const status = e.status ?? e.statusCode ?? 0;

  if (!status) {
    return new ApiError(0, 'network_error', 'Could not reach the server.');
  }

  const body = e.data?.error;
  return new ApiError(
    status,
    body?.code ?? 'unknown_error',
    body?.message ?? 'Something went wrong.',
    body?.details,
  );
}

export function useApi() {
  const config = useRuntimeConfig();
  const base = config.public.apiBase;
  const token = useAccessToken();
  const user = useCurrentUser();

  async function raw<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    try {
      return await $fetch<T>(path, {
        baseURL: base,
        method: options.method ?? 'GET',
        // Carries the httpOnly refresh cookie. The API allows exactly one
        // origin with credentials (see server CORS config).
        credentials: 'include',
        headers: token.value ? { Authorization: `Bearer ${token.value}` } : {},
        ...(options.body !== undefined ? { body: options.body } : {}),
        ...(options.query ? { query: options.query } : {}),
      });
    } catch (err) {
      throw toApiError(err);
    }
  }

  async function refreshSession(): Promise<boolean> {
    refreshInFlight ??= (async () => {
      try {
        const result = await raw<AuthResponse>('/auth/refresh', {
          method: 'POST',
          skipRefresh: true,
        });
        token.value = result.accessToken;
        user.value = result.user;
        return true;
      } catch {
        clearSession();
        return false;
      }
    })();

    try {
      return await refreshInFlight;
    } finally {
      refreshInFlight = null;
    }
  }

  /**
   * Every call goes through here: one attempt, and on 401 exactly one silent
   * refresh-and-retry. A second 401 means the session is genuinely over.
   */
  async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    try {
      return await raw<T>(path, options);
    } catch (err) {
      const apiError = err instanceof ApiError ? err : toApiError(err);

      if (apiError.status === 401 && !options.skipRefresh) {
        const refreshed = await refreshSession();
        if (refreshed) return raw<T>(path, options);
        await handleSessionExpired();
      }

      throw apiError;
    }
  }

  return {
    request,
    refreshSession,
    get: <T>(path: string, query?: ApiRequestOptions['query']) =>
      request<T>(path, query ? { query } : {}),
    post: <T>(path: string, body?: Record<string, unknown>) =>
      request<T>(path, { method: 'POST', ...(body ? { body } : {}) }),
    patch: <T>(path: string, body?: Record<string, unknown>) =>
      request<T>(path, { method: 'PATCH', ...(body ? { body } : {}) }),
    del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  };
}

/** Human-facing message for any thrown value, for use in `catch` blocks. */
export function errorMessage(err: unknown, fallback = 'Something went wrong.'): string {
  if (err instanceof ApiError) {
    return err.isNetwork ? 'Could not reach the server. Is the API running?' : err.message;
  }
  return err instanceof Error && err.message ? err.message : fallback;
}
