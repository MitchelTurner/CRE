import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { clearToken, getToken, setToken as persistToken } from '../lib/auth';
import { AUTH_LOST_EVENT, verifyToken } from '../lib/api';

interface AuthContextValue {
  ready: boolean;
  authenticated: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = getToken();
      if (!existing) {
        if (!cancelled) {
          setAuthenticated(false);
          setReady(true);
        }
        return;
      }
      try {
        const ok = await verifyToken();
        if (!cancelled) setAuthenticated(ok);
        if (!ok) clearToken();
      } catch {
        if (!cancelled) setAuthenticated(false);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onAuthLost = () => setAuthenticated(false);
    window.addEventListener(AUTH_LOST_EVENT, onAuthLost);
    return () => window.removeEventListener(AUTH_LOST_EVENT, onAuthLost);
  }, []);

  const login = useCallback(async (token: string) => {
    persistToken(token.trim());
    const ok = await verifyToken();
    if (!ok) {
      clearToken();
      throw new Error('Invalid API token — must match API_TOKEN on the server');
    }
    setAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider value={{ ready, authenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
