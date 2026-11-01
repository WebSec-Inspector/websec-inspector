import React, { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import SeverityBadge from "../components/SeverityBadge";
import ReportDownload from "../components/ReportDownload";
import ScanStatusBadge from "../components/ScanStatusBadge";
import { ErrorPanel, LoadingPanel, StatePanel } from "../components/FeedbackState";
import { useScanPolling } from "../hooks/useScanPolling";
import { useAuth } from "../context/AuthContext";
import { ScanResponse } from "../services/api";
import { RESUME_SCAN_PARAM } from "./SubmitScanPage";
import { invalidResponseError } from "../lib/apiError";
import { STATUS_PRESENTATION, shouldKeepPolling } from "../lib/scanStatus";

/** Converte o parâmetro de rota em um id utilizável, sem chamar a API com valor inválido. */
function parseScanId(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export default function ScanReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const scanId = useMemo(() => parseScanId(id), [id]);
  const { scan, loading, error, polling, reload } = useScanPolling(scanId);

  const goToDashboard = () => navigate("/");
  const goToLogin = () => {
    logout();
    navigate("/login", { replace: true });
  };

  // Rota inválida (ex.: /scans/abc): não faz sentido consultar a API.
  if (scanId === null) {
    return (
      <Shell>
        <ErrorPanel
          title="Varredura inválida"
          error={invalidResponseError(`identificador de rota '${String(id)}'`)}
          handlers={{ dashboard: goToDashboard }}
        />
      </Shell>
    );
  }

  /*
   * Ainda sem dado: ou é o carregamento inicial, ou uma falha recuperável
   * está sendo repetida pelo hook. Os dois casos continuam em andamento, e
   * nenhum deles significa que a varredura não existe.
   */
  if (!scan && !error && (loading || polling)) {
    return (
      <Shell>
        <LoadingPanel
          label={
            polling && !loading
              ? "Falha ao consultar o servidor. Tentando novamente..."
              : "Carregando resultado da varredura..."
          }
        />
      </Shell>
    );
  }

  // Erro sem nenhum dado disponível: a tela nunca fica presa em "Carregando...".
  if (error && !scan) {
    return (
      <Shell>
        <ErrorPanel
          title="Não foi possível carregar a varredura"
          error={error}
          handlers={{
            retry: reload,
            dashboard: goToDashboard,
            login: goToLogin,
            back: () => navigate(-1),
          }}
        />
      </Shell>
    );
  }

  if (!scan) {
    return (
      <Shell>
        <StatePanel title="Varredura não encontrada">
          <p>Não existe varredura com o identificador informado.</p>
        </StatePanel>
      </Shell>
    );
  }

  const presentation = STATUS_PRESENTATION[scan.status];
  const transient = shouldKeepPolling(scan.status);

  return (
    <Shell>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{scan.hostname || "Varredura"}</h1>
          <p className="text-sm text-slate-400">Varredura #{scan.id} · {scan.findingsCount} resultados</p>
        </div>
        <ScanStatusBadge status={scan.status} pulsing={transient && polling} />
      </div>

      <div className="mb-6 rounded-xl border border-white/10 bg-panel p-5">
        <p className="text-sm text-slate-300">{presentation.description}</p>
        {transient && (
          <p className="mt-2 text-xs text-slate-500">
            {polling
              ? "Esta tela é atualizada automaticamente."
              : "A atualização automática foi interrompida."}
          </p>
        )}
        {scan.finishedAt && (
          <p className="mt-2 text-xs text-slate-500">
            {scan.status==="CANCELLED"?"Cancelada em":"Concluída em"} {new Date(scan.finishedAt).toLocaleString("pt-BR")}
          </p>
        )}
      </div>

      {/*
        Erro ocorrido quando já havia dados: mantém o último resultado visível
        e avisa que a atualização parou, em vez de descartar a tela inteira.
      */}
      {error && (
        <div className="mb-6">
          <ErrorPanel
            title="A atualização automática foi interrompida"
            error={error}
            handlers={{
              retry: reload,
              dashboard: goToDashboard,
              login: goToLogin,
              back: () => navigate(-1),
            }}
          />
        </div>
      )}

      {scan.status === "PENDING_VERIFICATION" && (
        <div className="mb-6 rounded-xl border border-risk-medium/40 bg-risk-medium/5 p-5">
          <p className="mb-3 text-sm text-slate-300">
            A varredura só é enfileirada após a confirmação de propriedade do domínio.
          </p>
          {/* Leva o ID adiante: confirmar precisa concluir esta varredura, não criar outra. */}
          <Link
            to={`/scans/novo?${RESUME_SCAN_PARAM}=${scan.id}`}
            className="inline-block rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink hover:opacity-90"
          >
            Concluir verificação do domínio
          </Link>
        </div>
      )}

      {(scan.status === "FAILED" || scan.status === "CANCELLED") && (
        <div className="mb-6 flex flex-wrap gap-3">
          <Link
            to="/scans/novo"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink hover:opacity-90"
          >
            Executar nova varredura
          </Link>
          <button
            type="button"
            onClick={goToDashboard}
            className="rounded-md border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
          >
            Voltar ao Dashboard
          </button>
        </div>
      )}

      {scan.status === "COMPLETED" && <ReportDownload scanId={scan.id} />}
      <Findings scan={scan} transient={transient} />
    </Shell>
  );
}

function Findings({ scan, transient }: { scan: ScanResponse; transient: boolean }) {
  if(scan.status==="CANCELLED")return <StatePanel title="Verificação cancelada"><p>Nenhuma varredura foi iniciada. O token do domínio continua válido para uma nova execução.</p></StatePanel>;
  if (scan.findings.length === 0) {
    if (scan.status === "COMPLETED") {
      return (
        <StatePanel title="Nenhuma vulnerabilidade encontrada">
          <p>A varredura terminou sem registrar findings para este domínio.</p>
        </StatePanel>
      );
    }
    if (transient) {
      return <LoadingPanel label="Aguardando conclusão da varredura..." />;
    }
    return (
      <StatePanel title="Sem resultados">
        <p>Esta varredura não produziu findings.</p>
      </StatePanel>
    );
  }

  return (
    <ul className="space-y-3">
      {scan.findings.map((f) => (
        <li key={f.id} className="rounded-xl border border-white/10 bg-panel p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="font-medium">{f.title || f.owaspCategory}</span>
            <SeverityBadge severity={f.severity} />
          </div>
          <p className="mb-2 text-sm text-slate-300">{f.description}</p>
          {f.affectedUrl && <p className="mb-2 break-all text-xs text-slate-400">{f.affectedUrl}</p>}
          <p className="text-xs text-slate-500">
            CVSS {f.cvssScore.toFixed(1)} — {f.recommendation}
          </p>
        </li>
      ))}
    </ul>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link to="/" className="mb-6 inline-block text-sm text-slate-400 hover:text-white">
        ← Dashboard
      </Link>
      {children}
    </div>
  );
}
