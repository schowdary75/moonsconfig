import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from '@/api/client';
import { tokenStore } from '@/api/tokenStore';
import type { ApiSuccess, Session } from '@/types/api';
import {
  crmLogin,
  crmLogout,
  crmVerifySession,
  crmGoogleLogin,
  type CrmUserRow,
} from '../lib/api/auth.functions';

interface AuthContextType {
  user: CrmUserRow | null;
  initialized: boolean;
  login: (
    email: string,
    password: string,
    workspace?: string,
  ) => Promise<{
    success: boolean;
    error?: string;
    mfaRequired?: boolean;
    challengeToken?: string;
  }>;
  completeMfa: (
    challengeToken: string,
    code: string,
    recovery?: boolean,
  ) => Promise<{ success: boolean; error?: string }>;
  refreshUser: () => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const CRM_SESSION_KEY = 'crm_session';
const CRM_SESSION_USER_KEY = 'crm_session_user';
const VERIFY_SESSION_TIMEOUT_MS = 20_000;
const SESSIONLESS_PUBLIC_PATHS = [
  '/register',
  '/verify-email',
  '/activate-owner',
  '/provisioning',
  '/accept-invitation',
  '/legal',
  '/pricing',
];

function isSessionlessPublicPath(pathname: string) {
  return SESSIONLESS_PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function clearLegacySession() {
  localStorage.removeItem(CRM_SESSION_KEY);
  localStorage.removeItem(CRM_SESSION_USER_KEY);
}

function persistLegacySession(user: CrmUserRow) {
  if (!user.session_token || user.platformUserId) return;
  localStorage.setItem(CRM_SESSION_KEY, user.session_token);
  const { session_token: _sessionToken, ...safeUser } = user;
  localStorage.setItem(CRM_SESSION_USER_KEY, JSON.stringify(safeUser));
}

function readCachedLegacyUser(): CrmUserRow | null {
  try {
    const raw = localStorage.getItem(CRM_SESSION_USER_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as CrmUserRow;
    return user?.id && user?.email ? user : null;
  } catch {
    clearLegacySession();
    return null;
  }
}

async function verifyLegacySession(sessionToken: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      crmVerifySession({ data: { sessionToken } }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Session verification timed out')),
          VERIFY_SESSION_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function errorMessage(error: unknown) {
  if (
    typeof error === 'object' &&
    error &&
    'response' in error &&
    typeof (error as { response?: { data?: { message?: unknown } } }).response?.data?.message ===
      'string'
  ) {
    return (error as { response: { data: { message: string } } }).response.data.message;
  }
  return error instanceof Error ? error.message : 'Server error occurred';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<CrmUserRow | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const legacyToken = localStorage.getItem(CRM_SESSION_KEY);
      const cached = readCachedLegacyUser();

      // Registration, verification and other public flows do not consume the
      // signed-in CRM identity. Avoid all session probes on those routes: a new
      // visitor has no refresh cookie, so /auth/refresh can only produce a
      // misleading 401 (twice under React StrictMode in development).
      if (isSessionlessPublicPath(window.location.pathname)) {
        tokenStore.set(null);
        return;
      }

      // Legacy-session deployments authenticate via the stored CRM token, not
      // the commercial refresh cookie. When a legacy token is present, restore
      // from it directly and skip the /auth/refresh probe — that probe always
      // 401s for these users (there is no commercial cookie) and only adds
      // noise. Commercial-only sessions (no legacy token) are unaffected.
      if (legacyToken) {
        try {
          const result = await verifyLegacySession(legacyToken);
          if (mounted && result.user) {
            tokenStore.set(legacyToken, 'legacy');
            setUser(result.user);
          } else if (mounted) {
            clearLegacySession();
          }
        } catch {
          if (mounted && cached) {
            tokenStore.set(legacyToken, 'legacy');
            setUser({ ...cached, session_token: legacyToken });
          }
        }
        return;
      }

      // No legacy session — restore a commercial session from the rotating
      // HttpOnly cookie.
      try {
        const response =
          await apiClient.post<ApiSuccess<Session & { user: CrmUserRow }>>('/auth/refresh');
        if (!mounted) return;
        tokenStore.set(response.data.data.accessToken);
        setUser(response.data.data.user as CrmUserRow);
        clearLegacySession();
      } catch {
        tokenStore.set(null);
      }
    })().finally(() => mounted && setInitialized(true));
    return () => {
      mounted = false;
    };
  }, []);

  const login = async (email: string, password: string, workspace?: string) => {
    try {
      if (workspace?.trim()) {
        const response = await apiClient.post<ApiSuccess<Session & { user: CrmUserRow }>>(
          '/auth/login',
          { email, password, workspace: workspace.trim().toLowerCase() },
        );
        const result = response.data.data as any;
        if (result.mfaRequired)
          return { success: false, mfaRequired: true, challengeToken: result.challengeToken };
        tokenStore.set(result.accessToken);
        setUser(result.user as CrmUserRow);
        clearLegacySession();
        localStorage.setItem('moonsconfig_workspace', workspace.trim().toLowerCase());
        return { success: true };
      }
      const result = await crmLogin({ data: { email, password } });
      if (!result.success || !result.user) {
        return { success: false, error: result.error || 'Authentication failed' };
      }
      tokenStore.set(result.user.session_token ?? null, 'legacy');
      setUser(result.user);
      persistLegacySession(result.user);
      return { success: true };
    } catch (error) {
      return { success: false, error: errorMessage(error) };
    }
  };

  const completeMfa = async (challengeToken: string, code: string, recovery = false) => {
    try {
      const response = await apiClient.post<ApiSuccess<Session & { user: CrmUserRow }>>(
        '/auth/mfa/challenge',
        { challengeToken, code, recovery },
      );
      tokenStore.set(response.data.data.accessToken);
      setUser(response.data.data.user);
      clearLegacySession();
      return { success: true };
    } catch (error) {
      return { success: false, error: errorMessage(error) };
    }
  };

  const refreshUser = async () => {
    const response =
      await apiClient.post<ApiSuccess<Session & { user: CrmUserRow }>>('/auth/refresh');
    tokenStore.set(response.data.data.accessToken);
    setUser(response.data.data.user);
  };

  const loginWithGoogle = async (credential: string) => {
    try {
      const result = await crmGoogleLogin({ data: { credential } });
      if (!result.success || !result.user) {
        return { success: false, error: result.error || 'Google auth failed' };
      }
      tokenStore.set(result.user.session_token ?? null, 'legacy');
      setUser(result.user);
      persistLegacySession(result.user);
      return { success: true };
    } catch (error) {
      return { success: false, error: errorMessage(error) };
    }
  };

  const logout = async () => {
    try {
      if (user?.session_token) {
        await crmLogout({ data: { sessionToken: user.session_token } });
      } else if (tokenStore.get()) {
        await apiClient.post('/auth/logout');
      }
    } finally {
      tokenStore.set(null);
      setUser(null);
      clearLegacySession();
      window.location.href = '/login';
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, initialized, login, completeMfa, refreshUser, loginWithGoogle, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
