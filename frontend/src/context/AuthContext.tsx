import React, { createContext, useContext, useEffect, useState } from "react";
import { login as apiLogin, register as apiRegister, logout as apiLogout, retryPendingRevocation, sessionSnapshot } from "../services/api";
import {SESSION_EVENT} from '../services/sessionState';

interface AuthContextValue {
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  logoutPending: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState(sessionSnapshot);
  const [revoking, setRevoking] = useState(false);
  const token = session.token;

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
    <AuthContext.Provider value={{ token, login, register, logout, logoutPending: session.logoutPending }}>
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
