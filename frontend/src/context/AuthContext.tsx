import React, { createContext, useContext, useEffect, useState } from "react";
import { login as apiLogin, register as apiRegister, logout as apiLogout, retryPendingRevocation, sessionSnapshot, getCurrentUser, CurrentUserProfile } from "../services/api";
import {ApiError, toApiError} from '../lib/apiError';
import {SESSION_EVENT} from '../services/sessionState';

interface AuthContextValue {
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  logoutPending: boolean;
  currentUser: CurrentUserProfile | null;
  currentUserLoading: boolean;
  currentUserError: ApiError | null;
  refreshCurrentUser: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState(sessionSnapshot);
  const [revoking, setRevoking] = useState(false);
  const token = session.token;
  const [profile, setProfile] = useState<{epoch:string; value:CurrentUserProfile} | null>(null);
  const currentUser = token && profile?.epoch === session.epoch ? profile.value : null;
  const [currentUserLoading, setCurrentUserLoading] = useState(Boolean(token));
  const [currentUserError, setCurrentUserError] = useState<ApiError | null>(null);
  const [profileVersion, setProfileVersion] = useState(0);

  useEffect(() => {
    let active = true;
    const epoch = session.epoch;
    const valid = () => active && sessionSnapshot().epoch === epoch && Boolean(sessionSnapshot().token);
    setProfile(null);
    setCurrentUserError(null);
    setCurrentUserLoading(Boolean(token));
    if (token) getCurrentUser()
      .then(value => { if (valid()) setProfile({epoch,value}); })
      .catch(error => { if (valid()) setCurrentUserError(toApiError(error)); })
      .finally(() => { if (valid()) setCurrentUserLoading(false); });
    return () => { active = false; };
  }, [token, session.epoch, profileVersion]);

  useEffect(() => {
    const synchronize = () => setSession(sessionSnapshot());
    const reconnect = () => {
      if (sessionSnapshot().logoutPending) void retryPendingRevocation().catch(() => { /* durable notice remains */ });
    };
    window.addEventListener(SESSION_EVENT, synchronize);
    window.addEventListener('storage', synchronize);
    window.addEventListener('online', reconnect);
    return () => {
      window.removeEventListener(SESSION_EVENT, synchronize);
      window.removeEventListener('storage', synchronize);
      window.removeEventListener('online', reconnect);
    };
  }, []);

  async function login(email: string, password: string) {
    await apiLogin(email, password);
  }

  async function register(name: string, email: string, password: string) {
    await apiRegister(name, email, password);
  }

  function logout() {
    void apiLogout().catch(() => { /* local logout is complete; durable notice remains */ });
  }

  async function retryLogout() {
    setRevoking(true);
    try { await retryPendingRevocation(); }
    catch { /* pending notice distinguishes server failure from local logout */ }
    finally { setRevoking(false); }
  }

  return (
    <AuthContext.Provider value={{ token, login, register, logout, logoutPending: session.logoutPending, currentUser, currentUserLoading, currentUserError, refreshCurrentUser: () => setProfileVersion(value => value + 1) }}>
      {children}
      {session.logoutPending && <div role="status" className="fixed bottom-4 left-4 right-4 z-50 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 shadow-lg">
        <p>Você saiu deste navegador. A revogação no servidor está pendente.</p>
        <button type="button" disabled={revoking} onClick={() => void retryLogout()} className="mt-2 font-semibold underline disabled:opacity-50">
          {revoking ? 'Revogando sessão…' : 'Tentar revogar sessão'}
        </button>
      </div>}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
