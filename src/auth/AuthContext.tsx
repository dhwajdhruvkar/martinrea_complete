import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { authApi } from '@/lib/api';
import type { AuthUser } from '@/types/user';

export interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const navigate = useNavigate();
  const loadingProfile = useRef(false);

  // Resolve the profile for a freshly-seen session token (once per change).
  const hydrateProfile = useCallback(async (accessToken: string | null) => {
    setToken(accessToken);
    if (!accessToken) {
      setUser(null);
      return;
    }
    if (loadingProfile.current) return;
    loadingProfile.current = true;
    try {
      const fresh = await authApi.me();
      setUser(fresh);
    } catch {
      setUser(null);
    } finally {
      loadingProfile.current = false;
    }
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      await hydrateProfile(data.session?.access_token ?? null);
      if (active) setIsInitializing(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setToken(session?.access_token ?? null);
      if (!session) {
        setUser(null);
      } else {
        // Defer the profile fetch so we don't block the auth callback.
        void hydrateProfile(session.access_token);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [hydrateProfile]);

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    const res = await authApi.login(email, password);
    setToken(res.accessToken);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    void authApi.logout();
    setToken(null);
    setUser(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: !!token && !!user,
      isInitializing,
      login,
      logout,
    }),
    [user, token, isInitializing, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
