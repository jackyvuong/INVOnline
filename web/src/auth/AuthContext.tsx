import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type AuthUser = { email: string; displayName: string; avatarUrl?: string };

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function loadUser(): AuthUser | null {
  const raw = localStorage.getItem('qltk_user');
  return raw ? JSON.parse(raw) : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('qltk_token'));
  const [user, setUser] = useState<AuthUser | null>(loadUser);

  const value = useMemo(
    () => ({
      user,
      token,
      login: (t: string, u: AuthUser) => {
        localStorage.setItem('qltk_token', t);
        localStorage.setItem('qltk_user', JSON.stringify(u));
        setToken(t);
        setUser(u);
      },
      logout: () => {
        localStorage.removeItem('qltk_token');
        localStorage.removeItem('qltk_user');
        setToken(null);
        setUser(null);
      },
    }),
    [user, token]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
