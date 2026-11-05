import React, { createContext, useContext, useEffect, useState } from "react";
import { login as apiLogin, register as apiRegister, getCurrentUser, CurrentUserProfile } from "../services/api";
import { ApiError, toApiError } from "../lib/apiError";

interface AuthContextValue {
  token: string | null;
  currentUser: CurrentUserProfile | null;
  currentUserLoading: boolean;
  currentUserError: ApiError | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshCurrentUser: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem("websec_token")
  );
  const [currentUser, setCurrentUser] = useState<CurrentUserProfile | null>(null);
  const [currentUserLoading, setCurrentUserLoading] = useState(Boolean(localStorage.getItem("websec_token")));
  const [currentUserError, setCurrentUserError] = useState<ApiError | null>(null);
  const [profileVersion, setProfileVersion] = useState(0);

  useEffect(() => {
    const handleUnauthorized = () => {
      setToken(null);
      setCurrentUser(null);
    };
    window.addEventListener("websec:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("websec:unauthorized", handleUnauthorized);
  }, []);

  useEffect(() => {
    let active = true;
    if (!token) {
      setCurrentUser(null);
      setCurrentUserError(null);
      setCurrentUserLoading(false);
      return () => {
        active = false;
      };
    }

    setCurrentUser(null);
    setCurrentUserError(null);
    setCurrentUserLoading(true);
    getCurrentUser()
      .then((profile) => {
        if (active) setCurrentUser(profile);
      })
      .catch((err) => {
        if (active) setCurrentUserError(toApiError(err));
      })
      .finally(() => {
        if (active) setCurrentUserLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, profileVersion]);

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
    localStorage.removeItem("websec_token");
    setToken(null);
    setCurrentUser(null);
    setCurrentUserError(null);
  }

  return (
    <AuthContext.Provider
      value={{
        token,
        currentUser,
        currentUserLoading,
        currentUserError,
        login,
        register,
        logout,
        refreshCurrentUser: () => setProfileVersion((version) => version + 1),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
