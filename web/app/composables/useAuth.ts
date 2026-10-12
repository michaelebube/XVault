import type { AuthResponse } from '~/types/api';

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  inviteCode: string;
}

export function useAuth() {
  const api = useApi();
  const user = useCurrentUser();
  const token = useAccessToken();
  const ready = useAuthReady();

  function adopt(result: AuthResponse): void {
    token.value = result.accessToken;
    user.value = result.user;
  }

  async function login(email: string, password: string): Promise<void> {
    adopt(await api.post<AuthResponse>('/api/auth/login', { email, password }));
  }

  async function register(input: RegisterInput): Promise<void> {
    adopt(await api.post<AuthResponse>('/api/auth/register', { ...input }));
  }

  async function logout(): Promise<void> {
    try {
      // Revokes the refresh family server-side and clears the cookie. If it
      // fails we still drop the local session — a logout must never appear to
      // have failed from the user's side.
      await api.post('/api/auth/logout');
    } finally {
      clearSession();
      await navigateTo('/login');
    }
  }

  /**
   * Startup: trade the refresh cookie for an access token. A 401 here is the
   * normal "not signed in" case, not an error worth surfacing.
   */
  async function bootstrap(): Promise<void> {
    try {
      await api.refreshSession();
    } finally {
      ready.value = true;
    }
  }

  return { user, ready, login, register, logout, bootstrap };
}
