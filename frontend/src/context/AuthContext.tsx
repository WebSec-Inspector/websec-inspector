import React, { createContext, useContext, useEffect, useState } from "react";
import { login as apiLogin, register as apiRegister, logout as apiLogout } from "../services/api";

interface AuthContextValue {
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem("websec_token")
  );

  useEffect(() => {
    const handleUnauthorized = () => setToken(null);
    const handleToken = (event: Event) => setToken((event as CustomEvent<string>).detail);
    window.addEventListener("websec:unauthorized", handleUnauthorized);
    window.addEventListener("websec:token", handleToken);
    return () => {
      window.removeEventListener("websec:unauthorized", handleUnauthorized);
      window.removeEventListener("websec:token", handleToken);
    };
  }, []);

  async function login(email: string, password: string) {
    const { token } = await apiLogin(email, password);
    localStorage.setItem("websec_token", token);
    setToken(token);
  }

  async function register(name: string, email: string, password: string) {
    const { token } = await apiRegister(name, email, password);
    localStorage.setItem("websec_token", token);
    setToken(token);
  }

  function logout() {
    apiLogout();
    setToken(null);
  }

  return (
    <AuthContext.Provider value={{ token, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
