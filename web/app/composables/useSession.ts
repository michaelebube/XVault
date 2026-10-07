import type { PublicUser } from '~/types/api';

/**
 * Where the session lives.
 *
 * The access token is held in `useState` — component memory, gone on reload —
 * and deliberately never written to localStorage or a readable cookie
 * (AGENT.md §19). Durability comes from the httpOnly refresh cookie the browser
 * stores for us and JavaScript cannot read; on reload we exchange it for a new
 * access token instead of persisting one.
 */
export const useAccessToken = () => useState<string | null>('xv:token', () => null);

export const useCurrentUser = () => useState<PublicUser | null>('xv:user', () => null);

/** False until the initial refresh attempt has settled, so guards do not flash. */
export const useAuthReady = () => useState<boolean>('xv:auth-ready', () => false);

export function useIsAuthenticated() {
  const user = useCurrentUser();
  return computed(() => user.value !== null);
}

export const AUTH_ROUTES = ['/login', '/register'];

export function clearSession(): void {
  useAccessToken().value = null;
  useCurrentUser().value = null;
}

/**
 * Called when the refresh token is gone, expired, or was revoked. Clearing the
 * in-memory session is the security-relevant half; the redirect is courtesy.
 */
export async function handleSessionExpired(): Promise<void> {
  clearSession();
  const route = useRoute();
  if (!AUTH_ROUTES.includes(route.path)) {
    await navigateTo({ path: '/login', query: { expired: '1' } });
  }
}
