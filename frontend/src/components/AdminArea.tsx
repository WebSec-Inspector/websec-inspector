import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import AppShell from "./AppShell";
import { useAuth } from "../context/AuthContext";
import { getDomains, getDomainHistory, ScanResponse } from "../services/api";
import { ApiError, toApiError } from "../lib/apiError";

type AdminScanData = {
  scans: ScanResponse[];
  loading: boolean;
  error: ApiError | null;
  refresh: () => void;
};

const AdminScanContext = createContext<AdminScanData | null>(null);

export function useAdminScans() {
  const value = useContext(AdminScanContext);
  if (!value) throw new Error("useAdminScans deve ser usado dentro da área administrativa");
  return value;
}

function AdminScansProvider({ children }: { children: React.ReactNode }) {
  const [scans, setScans] = useState<ScanResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getDomains()
      .then((domains) => Promise.all(domains.map((domain) => getDomainHistory(domain.id))))
      .then((history) => {
        if (active) setScans(history.flat().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)));
      })
      .catch((err) => {
        if (!active) return;
        setScans([]);
        setError(toApiError(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [generation]);

  const refresh = useCallback(() => setGeneration((value) => value + 1), []);
  const value = useMemo(() => ({ scans, loading, error, refresh }), [scans, loading, error, refresh]);
  return <AdminScanContext.Provider value={value}>{children}</AdminScanContext.Provider>;
}

export default function AdminArea() {
  const { token, currentUser, currentUserLoading, currentUserError, refreshCurrentUser } = useAuth();
  if (!token) return <Navigate to="/login" replace />;

  if (currentUserLoading) {
    return (
      <AppShell mode="admin">
        <div className="page-message" role="status">Carregando seu perfil…</div>
      </AppShell>
    );
  }

  if (currentUserError || !currentUser) {
    return (
      <AppShell mode="admin">
        <div className="page-message page-message--error" role="alert">
          <h1>Não foi possível validar seu perfil</h1>
          <p>Recarregue os dados da conta para continuar.</p>
          <button type="button" className="button button--secondary" onClick={refreshCurrentUser}>
            Tentar novamente
          </button>
        </div>
      </AppShell>
    );
  }

  if (currentUser.role !== "ADMINISTRADOR") return <Navigate to="/" replace />;

  return (
    <AdminScansProvider>
      <AppShell mode="admin">
        <Outlet />
      </AppShell>
    </AdminScansProvider>
  );
}
