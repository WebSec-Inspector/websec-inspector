import React, { CSSProperties, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDomains } from "../context/DomainContext";
import { ApiError, toApiError } from "../lib/apiError";
import { Finding, getDomainHistory, ScanResponse } from "../services/api";
import ScanStatusBadge from "../components/ScanStatusBadge";
import arrowRightIcon from "../assets/figma/arrow-right.svg";
import calendarIcon from "../assets/figma/calendar.svg";
import timerIcon from "../assets/figma/timer.svg";
import globeIcon from "../assets/figma/globe.svg";
import checkIcon from "../assets/figma/check-circle.svg";
import shieldIcon from "../assets/figma/shield-check.svg";
import criticalMarker from "../assets/figma/severity-critical.svg";
import highMarker from "../assets/figma/severity-high.svg";
import mediumMarker from "../assets/figma/severity-medium.svg";
import lowMarker from "../assets/figma/severity-low.svg";

const severityRows = [
  { key: "CRITICAL", label: "Críticas", color: "#ff646b", marker: criticalMarker },
  { key: "HIGH", label: "Altas", color: "#ff9d45", marker: highMarker },
  { key: "MEDIUM", label: "Médias", color: "#f6c453", marker: mediumMarker },
  { key: "LOW", label: "Baixas", color: "#399eff", marker: lowMarker },
  { key: "INFORMATIONAL", label: "Informativas", color: "#6d8cb1", marker: null },
] as const;

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDuration(start: string, finish: string | null) {
  if (!finish) return "—";
  const milliseconds = Date.parse(finish) - Date.parse(start);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "—";
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return seconds + " s";
  return Math.floor(seconds / 60) + " min " + (seconds % 60) + " s";
}

function countFindings(findings: Finding[]) {
  const counts: Record<string, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    INFORMATIONAL: 0,
  };
  findings.forEach((finding) => {
    if (finding.severity in counts) counts[finding.severity] += 1;
  });
  return counts;
}

function DonutChart({ findings }: { findings: Finding[] }) {
  const counts = countFindings(findings);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  let cursor = 0;
  const segments = severityRows
    .filter((row) => counts[row.key] > 0)
    .map((row) => {
      const start = cursor;
      cursor += (counts[row.key] / Math.max(total, 1)) * 100;
      return row.color + " " + start + "% " + cursor + "%";
    });
  const gradient = segments.length > 0
    ? "conic-gradient(" + segments.join(", ") + ")"
    : "conic-gradient(#1c3d60 0% 100%)";

  return (
    <div className="findings-layout">
      <div className="severity-donut" style={{ background: gradient } as CSSProperties} role="img" aria-label={total + " vulnerabilidades encontradas"}>
        <div className="severity-donut__center">
          <strong>{total}</strong>
          <span>vulnerabilidades</span>
        </div>
      </div>
      <div className="severity-legend">
        {severityRows.filter((row) => row.key !== "INFORMATIONAL" || counts.INFORMATIONAL > 0).map((row) => {
          const count = counts[row.key];
          const percent = total === 0 ? 0 : Math.round((count / total) * 100);
          return (
            <div className="severity-legend__row" key={row.key}>
              {row.marker ? <img src={row.marker} alt="" aria-hidden="true" /> : <span className="severity-legend__dot" style={{ background: row.color }} />}
              <span>{row.label}</span>
              <strong>{count}</strong>
              <small>{percent}%</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LatestScanCard({ scan }: { scan: ScanResponse }) {
  return (
    <section className="latest-scan-card">
      <div className="latest-scan-card__main">
        <div className="eyebrow"><span className="status-indicator" /> Última varredura</div>
        <div className="latest-scan-card__title">
          <h2>{scan.hostname || "Domínio da varredura"}</h2>
          <ScanStatusBadge status={scan.status} />
        </div>
        <div className="latest-scan-card__meta">
          <span><img src={calendarIcon} alt="" aria-hidden="true" />{formatDate(scan.createdAt)}</span>
          <span><img src={timerIcon} alt="" aria-hidden="true" />{formatDuration(scan.createdAt, scan.finishedAt)}</span>
          <Link className="button button--primary" to={"/scans/" + scan.id}>
            Ver relatório <img src={arrowRightIcon} alt="" aria-hidden="true" />
          </Link>
        </div>
      </div>
      <aside className="latest-scan-card__score">
        <div className="score-ring" aria-hidden="true"><span>—<small>/100</small></span></div>
        <div>
          <span className="eyebrow">Segurança</span>
          <strong>Pontuação indisponível</strong>
          <small>A API não fornece um índice consolidado.</small>
        </div>
      </aside>
    </section>
  );
}

function FindingsCard({ scan }: { scan: ScanResponse }) {
  return (
    <section className="surface-card findings-card">
      <header className="surface-card__heading">
        <div>
          <h2>Vulnerabilidades encontradas</h2>
          <p>Distribuição por nível de severidade</p>
        </div>
        <span className="count-chip">{scan.findingsCount} no total</span>
      </header>
      {scan.status === "COMPLETED" ? (
        <DonutChart findings={scan.findings} />
      ) : (
        <div className="chart-empty">
          <span className="chart-empty__icon"><img src={shieldIcon} alt="" aria-hidden="true" /></span>
          <strong>Os resultados ainda não estão disponíveis</strong>
          <p>As vulnerabilidades serão exibidas quando a varredura for concluída.</p>
        </div>
      )}
    </section>
  );
}

function AnalysisDetails({ scan }: { scan: ScanResponse }) {
  return (
    <section className="surface-card analysis-card">
      <header className="surface-card__heading">
        <div>
          <h2>Detalhes da análise</h2>
          <p>Escopo e resultado da execução</p>
        </div>
      </header>
      <div className="analysis-url">
        <span className="eyebrow">URL analisada</span>
        <strong><img src={globeIcon} alt="" aria-hidden="true" />{scan.hostname || "—"}</strong>
      </div>
      <div className="analysis-stats">
        <div>
          <span className="eyebrow">Vulnerabilidades</span>
          <strong>{scan.findingsCount}</strong>
        </div>
        <div>
          <span className="eyebrow">Finalizada em</span>
          <strong>{scan.finishedAt ? formatDate(scan.finishedAt) : "—"}</strong>
        </div>
      </div>
      <div className="analysis-status">
        <div>
          <span>Status da varredura</span>
          <ScanStatusBadge status={scan.status} />
        </div>
        {scan.status === "COMPLETED" && (
          <p><img src={checkIcon} alt="" aria-hidden="true" /> A varredura foi concluída e os resultados estão disponíveis.</p>
        )}
      </div>
    </section>
  );
}

function Message({
  title,
  message,
  action,
  onRetry,
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
  onRetry?: () => void;
}) {
  return (
    <section className="empty-state">
      <span className="empty-state__icon"><img src={shieldIcon} alt="" aria-hidden="true" /></span>
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry && <button type="button" className="button button--outline" onClick={onRetry}>Tentar novamente</button>}
      {action}
    </section>
  );
}

export default function DashboardPage() {
  const {
    domains,
    activeDomainId,
    activeDomain,
    loading: domainsLoading,
    error: domainsError,
    refresh: refreshDomains,
    selectDomain,
  } = useDomains();
  const [history, setHistory] = useState<ScanResponse[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<ApiError | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setHistory(null);
    if (activeDomainId === null) {
      setHistoryError(null);
      setHistoryLoading(false);
      return () => { active = false; };
    }
    setHistoryLoading(true);
    setHistoryError(null);
    getDomainHistory(activeDomainId)
      .then((scans) => { if (active) setHistory(scans); })
      .catch((err) => { if (active) { setHistory(null); setHistoryError(toApiError(err)); } })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => {
      active = false;
    };
  }, [activeDomainId, refreshKey]);

  const latest = history?.[0] ?? null;
  const domainSelector = domains.length > 1 && (
    <label className="domain-picker">
      <span>Domínio ativo</span>
      <select value={activeDomainId ?? ""} onChange={(event) => selectDomain(Number(event.target.value))}>
        {domains.map((domain) => <option key={domain.id} value={domain.id}>{domain.hostname}</option>)}
      </select>
    </label>
  );

  const historyReload = () => setRefreshKey((value) => value + 1);

  return (
    <section className="page-view dashboard-view">
      <div className="dashboard-title-row">
        <div>
          <h1>Painel de varreduras de segurança</h1>
          <p>Visão consolidada da análise mais recente</p>
        </div>
        <Link to="/scans/novo" className="button button--primary">
          Nova varredura <img src={arrowRightIcon} alt="" aria-hidden="true" />
        </Link>
      </div>
      {domainSelector}

      {domainsError ? (
        <Message title="Não foi possível carregar seus domínios" message={domainsError.message} onRetry={refreshDomains} />
      ) : domainsLoading && domains.length === 0 ? (
        <div className="page-message" role="status">Carregando seus domínios…</div>
      ) : domains.length === 0 || activeDomainId === null ? (
        <Message
          title="Nenhum domínio cadastrado"
          message="Submeta uma URL para cadastrar seu primeiro domínio e iniciar a verificação de propriedade."
          action={<Link to="/scans/novo" className="button button--primary">Submeter uma URL <img src={arrowRightIcon} alt="" aria-hidden="true" /></Link>}
        />
      ) : historyError ? (
        <Message title="Não foi possível carregar o histórico" message={historyError.message} onRetry={historyReload} />
      ) : historyLoading && !history ? (
        <div className="page-message" role="status">Carregando a análise mais recente…</div>
      ) : !history || history.length === 0 ? (
        <Message
          title="Nenhuma varredura neste domínio"
          message={activeDomain?.verified ? "Este domínio ainda não tem varreduras registradas." : "Conclua a verificação de propriedade para executar a primeira varredura."}
          action={<Link to="/scans/novo" className="button button--primary">Nova varredura <img src={arrowRightIcon} alt="" aria-hidden="true" /></Link>}
        />
      ) : (
        <>
          <LatestScanCard scan={latest!} />
          <div className="dashboard-grid">
            <FindingsCard scan={latest!} />
            <AnalysisDetails scan={latest!} />
          </div>
          {domains.length > 1 && <p className="dashboard-scope">Histórico de {activeDomain?.hostname || "domínio selecionado"}</p>}
        </>
      )}
    </section>
  );
}
