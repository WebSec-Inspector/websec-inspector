import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useDomains } from "../context/DomainContext";
import { useRequestGeneration } from "../hooks/useRequestGeneration";
import { getDomainHistory, ScanResponse } from "../services/api";
import { ApiError, toApiError } from "../lib/apiError";
import { ErrorPanel, LoadingPanel, StatePanel } from "../components/FeedbackState";
import ScanStatusBadge from "../components/ScanStatusBadge";

export default function DashboardPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const {
    domains,
    activeDomainId,
    activeDomain,
    loading: domainsLoading,
    error: domainsError,
    refresh: refreshDomains,
    selectDomain,
  } = useDomains();

  const [history, setHistory] = useState<{
    domainId: number;
    scans: ScanResponse[];
  } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<ApiError | null>(null);

  const request = useRequestGeneration();

  const goToLogin = useCallback(() => {
    logout();
    navigate("/login", { replace: true });
  }, [logout, navigate]);

  /*
   * Uma consulta nunca é descartada por já existir outra em andamento: a mais
   * recente sempre vence. A anterior continua chegando, mas é ignorada, para
   * que o histórico de um domínio não apareça sob outro domínio selecionado.
   */
  const loadHistory = useCallback(
    async (domainId: number) => {
      const generation = request.start();
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const data = await getDomainHistory(domainId);
        if (!request.isCurrent(generation)) return;
        setHistory({ domainId, scans: data });
      } catch (err) {
        if (!request.isCurrent(generation)) return;
        setHistory(null);
        setHistoryError(toApiError(err));
      } finally {
        if (request.isCurrent(generation)) setHistoryLoading(false);
      }
    },
    [request],
  );

  /*
   * A consulta do historico so acontece com um domainId resolvido pelo
   * DomainContext. Sem dominio, nenhuma requisicao e disparada - era
   * justamente a chamada que a tela anterior prometia e nunca fazia.
   */
  useEffect(() => {
    if (activeDomainId === null) {
      // Sem domínio: descarta o que estiver em voo antes de limpar a tela.
      request.invalidate();
      setHistory(null);
      setHistoryError(null);
      setHistoryLoading(false);
      return;
    }
    void loadHistory(activeDomainId);
  }, [activeDomainId, loadHistory, request]);

  const reloadHistory = useCallback(() => {
    if (activeDomainId !== null) void loadHistory(activeDomainId);
  }, [activeDomainId, loadHistory]);

  return (
    <div className="min-h-screen px-6 py-8">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">WebSec Inspector</h1>
          <p className="text-sm text-slate-400">Painel de varreduras de segurança</p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/dominios"
            className="rounded-md border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
          >
            Meus domínios
          </Link>
          <Link
            to="/scans/novo"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink hover:opacity-90"
          >
            Nova varredura
          </Link>
          <button
            onClick={logout}
            className="rounded-md border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
          >
            Sair
          </button>
        </div>
      </header>

      {domains.length > 1 && (
        <DomainSelector
          domains={domains}
          activeDomainId={activeDomainId}
          onSelect={selectDomain}
        />
      )}

      <Content
        domainsLoading={domainsLoading}
        domainsError={domainsError}
        refreshDomains={refreshDomains}
        goToLogin={goToLogin}
        hasDomains={domains.length > 0}
        activeDomain={activeDomain}
        activeDomainId={activeDomainId}
        history={history?.domainId === activeDomainId ? history.scans : null}
        historyLoading={historyLoading}
        historyError={historyError}
        reloadHistory={reloadHistory}
      />
    </div>
  );
}

function Content({
  domainsLoading,
  domainsError,
  refreshDomains,
  goToLogin,
  hasDomains,
  activeDomain,
  activeDomainId,
  history,
  historyLoading,
  historyError,
  reloadHistory,
}: {
  domainsLoading: boolean;
  domainsError: ApiError | null;
  refreshDomains: () => void;
  goToLogin: () => void;
  hasDomains: boolean;
  activeDomain: { hostname: string; verified: boolean } | null;
  activeDomainId: number | null;
  history: ScanResponse[] | null;
  historyLoading: boolean;
  historyError: ApiError | null;
  reloadHistory: () => void;
}) {
  // 1. Carregando a lista de dominios.
  if (domainsLoading && !hasDomains) {
    return <LoadingPanel label="Carregando seus domínios..." />;
  }

  // 2. Falha ao carregar dominios.
  if (domainsError) {
    return (
      <ErrorPanel
        title="Não foi possível carregar seus domínios"
        error={domainsError}
        handlers={{ retry: refreshDomains, login: goToLogin }}
      />
    );
  }

  // 3. Nenhum dominio cadastrado.
  if (!hasDomains || activeDomainId === null) {
    return (
      <StatePanel title="Você ainda não tem domínios cadastrados">
        <p className="mb-4">
          Submeta uma URL para cadastrar seu primeiro domínio e iniciar a verificação de
          propriedade.
        </p>
        <Link
          to="/scans/novo"
          className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink hover:opacity-90"
        >
          Submeter uma URL
        </Link>
      </StatePanel>
    );
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-slate-200">
            Histórico de {activeDomain?.hostname ?? `domínio #${activeDomainId}`}
          </h2>
          <p className="text-xs text-slate-500">
            {activeDomain?.verified
              ? "Domínio verificado."
              : "Domínio ainda não verificado — conclua a verificação para executar varreduras."}
          </p>
        </div>
        <button
          type="button"
          onClick={reloadHistory}
          disabled={historyLoading}
          className="rounded-md border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50"
        >
          {historyLoading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>

      {/* 4. Carregando o historico. */}
      {historyLoading && history === null && <LoadingPanel label="Carregando histórico..." />}

      {/* 5. Falha ao carregar o historico. */}
      {historyError && (
        <ErrorPanel
          title="Não foi possível carregar o histórico"
          error={historyError}
          handlers={{ retry: reloadHistory, login: goToLogin }}
        />
      )}

      {/* 6. Historico vazio. */}
      {!historyLoading && !historyError && history !== null && history.length === 0 && (
        <StatePanel title="Nenhuma varredura neste domínio">
          <p className="mb-4">
            {activeDomain?.verified
              ? "Este domínio ainda não tem varreduras registradas."
              : "Conclua a verificação de propriedade para executar a primeira varredura."}
          </p>
          <Link
            to="/scans/novo"
            className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink hover:opacity-90"
          >
            Nova varredura
          </Link>
        </StatePanel>
      )}

      {/* 7. Historico carregado. */}
      {history !== null && history.length > 0 && <HistoryList scans={history} />}
    </section>
  );
}

function HistoryList({ scans }: { scans: ScanResponse[] }) {
  return (
    <ul className="space-y-3">
      {scans.map((scan) => (
        <li key={scan.id}>
          <Link
            to={`/scans/${scan.id}`}
            className="block rounded-xl border border-white/10 bg-panel p-4 transition hover:border-accent/40"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <span className="font-medium">Varredura #{scan.id}</span>
              <ScanStatusBadge status={scan.status} />
            </div>
            <p className="text-xs text-slate-500">
              Criada em{" "}
              {scan.createdAt
                ? new Date(scan.createdAt).toLocaleString("pt-BR")
                : "data indisponível"}
              {scan.findings.length > 0 &&
                ` — ${scan.findings.length} ${
                  scan.findings.length === 1 ? "finding" : "findings"
                }`}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function DomainSelector({
  domains,
  activeDomainId,
  onSelect,
}: {
  domains: Array<{ id: number; hostname: string; verified: boolean }>;
  activeDomainId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="mb-6">
      <label htmlFor="domain-select" className="mb-1 block text-xs text-slate-400">
        Domínio
      </label>
      <select
        id="domain-select"
        value={activeDomainId ?? ""}
        onChange={(e) => onSelect(Number(e.target.value))}
        className="rounded-md border border-white/10 bg-ink px-3 py-2 text-sm outline-none focus:border-accent"
      >
        {domains.map((d) => (
          <option key={d.id} value={d.id}>
            {d.hostname} {d.verified ? "(verificado)" : "(não verificado)"}
          </option>
        ))}
      </select>
    </div>
  );
}
