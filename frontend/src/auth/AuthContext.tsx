import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { clearToken, getToken, setToken as persistToken } from "../api/client";
import { getMe } from "../api/endpoints";
import type { CurrentUser } from "../api/types";

interface AuthContextValue {
  isAuthenticated: boolean;
  currentUser: CurrentUser | null;
  setAuthenticated: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getToken()));
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setCurrentUser(null);
      return;
    }
    getMe()
      .then(setCurrentUser)
      .catch(() => setCurrentUser(null));
  }, [isAuthenticated]);

  const setAuthenticated = (token: string) => {
    persistToken(token);
    setIsAuthenticated(true);
  };

  const logout = () => {
    clearToken();
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, currentUser, setAuthenticated, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
