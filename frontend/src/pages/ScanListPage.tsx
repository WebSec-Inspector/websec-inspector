import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getScans, ScanListResult } from "../services/scanList";
import { ApiError, toApiError } from "../lib/apiError";
import { SCAN_STATUSES, ScanStatus, statusLabel } from "../lib/scanStatus";
import ScanStatusBadge from "../components/ScanStatusBadge";
import SeverityBadge from "../components/SeverityBadge";

export default function ScanListPage() {
  const [query, setQuery] = useState<{page: number; status: ScanStatus | ""}>({page: 0, status: ""});
  const [result, setResult] = useState<ScanListResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setLoading(true); setResult(null); setError(null);
    getScans({page: query.page, size: 20, ...(query.status ? {status: query.status} : {})}, controller.signal)
      .then(data => { if (current) setResult(data); })
      .catch(reason => {
        if (current) setError(reason?.kind === "invalid_response" ? reason : toApiError(reason));
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [query, retry]);

  return <main className="mx-auto max-w-6xl px-6 py-8">
    <Link to="/" className="text-accent hover:underline">Voltar ao painel</Link>
    <h1 className="mt-4 text-3xl font-semibold text-white">Varreduras</h1>
    <p className="mt-2 text-sm text-slate-400">Histórico de varreduras no seu escopo de acesso, incluindo domínios arquivados.</p>
    <label className="my-6 flex max-w-xs flex-col gap-2 text-sm text-slate-300" htmlFor="scan-list-status">
      Status
      <select id="scan-list-status" className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-white"
        value={query.status} onChange={e => setQuery({page: 0, status: e.target.value as ScanStatus | ""})}>
        <option value="">Todos os status</option>
        {SCAN_STATUSES.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}
      </select>
    </label>
    <section aria-label="Resultados das varreduras" aria-busy={loading}>
      {loading && <p role="status" className="py-8 text-slate-300">Carregando varreduras…</p>}
      {error && <div role="alert" className="rounded-lg border border-red-500/30 p-5 text-slate-200">
        <p>{error.message}</p>
        {error.kind === "unauthorized" ? <Link to="/login" className="mt-3 inline-block text-accent">Fazer login</Link> :
          <button className="mt-3 text-accent" onClick={() => setRetry(n => n + 1)}>Tentar novamente</button>}
      </div>}
      {result && !loading && <>
        <p className="mb-3 text-sm text-slate-400">{result.totalElements} varreduras encontradas</p>
        {result.content.length === 0 ? <p className="py-8 text-slate-300">Nenhuma varredura encontrada para estes filtros.</p> :
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-900 text-slate-400"><tr>
                {["Varredura", "Domínio", "Status", "Criada em", "Concluída em", "Achados", "Maior risco do scanner"].map(title => <th key={title} scope="col" className="px-4 py-3">{title}</th>)}
              </tr></thead>
              <tbody>{result.content.map(scan => <tr key={scan.id} className="border-t border-slate-800">
                <td className="px-4 py-4"><Link className="text-accent hover:underline" to={`/scans/${scan.id}`}>{scan.name || `Varredura #${scan.id}`}</Link></td>
                <td className="px-4 py-4">{scan.hostname}{!scan.domainActive && <span className="mt-1 block text-xs text-slate-400">Domínio arquivado</span>}</td>
                <td className="px-4 py-4"><ScanStatusBadge status={scan.status} /></td>
                <td className="px-4 py-4"><time dateTime={scan.createdAt}>{new Date(scan.createdAt).toLocaleString("pt-BR")}</time></td>
                <td className="px-4 py-4">{scan.finishedAt ? <time dateTime={scan.finishedAt}>{new Date(scan.finishedAt).toLocaleString("pt-BR")}</time> : "—"}</td>
                <td className="px-4 py-4">{scan.findingsCount}</td>
                <td className="px-4 py-4">{scan.maxSeverity ? <SeverityBadge severity={scan.maxSeverity} /> : "Sem achados"}</td>
              </tr>)}</tbody>
            </table>
          </div>}
        <nav aria-label="Paginação de varreduras" className="mt-5 flex items-center justify-between gap-4 text-sm">
          <button className="rounded-lg border border-slate-700 px-4 py-2 disabled:opacity-40" disabled={query.page === 0}
            onClick={() => setQuery(q => ({...q, page: q.page - 1}))}>Anterior</button>
          <span aria-live="polite" className="text-slate-400">Página {result.page + 1} de {Math.max(1, result.totalPages)}</span>
          <button className="rounded-lg border border-slate-700 px-4 py-2 disabled:opacity-40" disabled={result.page + 1 >= result.totalPages}
            onClick={() => setQuery(q => ({...q, page: q.page + 1}))}>Próxima</button>
        </nav>
      </>}
    </section>
  </main>;
}
