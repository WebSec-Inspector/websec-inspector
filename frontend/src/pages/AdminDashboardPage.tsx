import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AdminDashboardMetrics, getAdminDashboard } from "../services/api";
import { ApiError, toApiError } from "../lib/apiError";
import { LoadingPanel, StatePanel } from "../components/FeedbackState";

export default function AdminDashboardPage() {
  const [days, setDays] = useState<number>(7);
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<ApiError | null>(null);

  const loadMetrics = useCallback(async (periodDays: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminDashboard(periodDays);
      setMetrics(data);
    } catch (err) {
      setMetrics(null);
      setError(toApiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMetrics(days);
  }, [days, loadMetrics]);

  return (
    <div className="min-h-screen px-6 py-8">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Visão Administrativa</h1>
          <p className="text-sm text-slate-400">
            Acompanhamento operacional e indicadores de uso da plataforma
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            aria-label="Período"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-md border border-white/10 bg-ink px-3 py-2 text-sm text-slate-200 outline-none focus:border-accent"
          >
            <option value={7}>Últimos 7 dias</option>
            <option value={15}>Últimos 15 dias</option>
            <option value={30}>Últimos 30 dias</option>
          </select>
          <Link
            to="/"
            className="rounded-md border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
          >
            Voltar ao Painel
          </Link>
        </div>
      </header>

      {loading && <LoadingPanel label="Carregando indicadores administrativos..." />}

      {!loading && error && (
        <StatePanel
          title={
            error.status === 403
              ? "Acesso Restrito ao Papel ADMIN"
              : "Não foi possível carregar os indicadores"
          }
        >
          <p className="mb-4 text-sm text-slate-400">{error.message}</p>
          <Link
            to="/"
            className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink hover:opacity-90"
          >
            Retornar ao início
          </Link>
        </StatePanel>
      )}

      {!loading && !error && metrics && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-panel p-5">
              <p className="text-xs text-slate-400">Quantidade de Usuários</p>
              <p className="mt-2 text-2xl font-semibold">{metrics.totalUsers}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-panel p-5">
              <p className="text-xs text-slate-400">Total de Varreduras</p>
              <p className="mt-2 text-2xl font-semibold">{metrics.totalScans}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-panel p-5">
              <p className="text-xs text-slate-400">Falhas de Processamento</p>
              <p className="mt-2 text-2xl font-semibold text-red-400">
                {metrics.processingFailures}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-panel p-5">
              <p className="text-xs text-slate-400">Tempo Médio de Execução</p>
              <p className="mt-2 text-2xl font-semibold">
                {metrics.averageExecutionSeconds}s
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-panel p-5">
              <h2 className="mb-4 text-sm font-medium text-slate-200">
                Scans por Estado
              </h2>
              <ul className="space-y-2.5 text-sm">
                {Object.entries(metrics.scansByStatus).map(([status, count]) => (
                  <li key={status} className="flex items-center justify-between">
                    <span className="text-slate-400">{status}</span>
                    <span className="font-mono font-medium text-slate-200">{count}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-white/10 bg-panel p-5">
              <h2 className="mb-4 text-sm font-medium text-slate-200">
                Distribuição por Severidade
              </h2>
              <ul className="space-y-2.5 text-sm">
                {Object.entries(metrics.findingsBySeverity).map(([sev, count]) => (
                  <li key={sev} className="flex items-center justify-between">
                    <span className="text-slate-400">{sev}</span>
                    <span className="font-mono font-medium text-slate-200">{count}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-white/10 bg-panel p-5">
              <h2 className="mb-4 text-sm font-medium text-slate-200">
                Scans por Período ({days} dias)
              </h2>
              <ul className="max-h-56 space-y-2 overflow-y-auto pr-1 text-sm">
                {metrics.scansByPeriod.map((item) => (
                  <li key={item.date} className="flex items-center justify-between">
                    <span className="text-slate-400">{item.date}</span>
                    <span className="font-mono font-medium text-slate-200">
                      {item.count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}