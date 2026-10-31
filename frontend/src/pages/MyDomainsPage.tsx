import React, { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { archiveDomain, createDomain, DomainCreateResponse, verifyDomain } from "../services/api";
import { useDomains } from "../context/DomainContext";
import { toApiError } from "../lib/apiError";

export default function MyDomainsPage() {
  const { domains, loading, error, refresh } = useDomains();
  const [hostname, setHostname] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyDomainId, setBusyDomainId] = useState<number | null>(null);
  const [created, setCreated] = useState<DomainCreateResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setActionError(null);
    setNotice(null);
    try {
      const ownerId = targetUserId.trim() ? Number(targetUserId) : null;
      if (ownerId !== null && (!Number.isSafeInteger(ownerId) || ownerId <= 0)) {
        throw new Error("Informe um ID de proprietário válido.");
      }
      const result = await createDomain(hostname, ownerId);
      setCreated(result);
      setHostname("");
      setNotice(result.verified
        ? "Este domínio já está verificado. O cadastro idempotente preservou o token existente."
        : result.verificationToken
          ? "Domínio cadastrado. Publique a prova abaixo e depois solicite a verificação."
          : "Domínio cadastrado. O token não foi exibido porque o proprietário é outra conta.");
      refresh();
    } catch (err) {
      setActionError(err instanceof Error && !("response" in err)
        ? err.message
        : toApiError(err).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleVerify(domainId: number) {
    setBusyDomainId(domainId);
    setActionError(null);
    setNotice(null);
    try {
      await verifyDomain(domainId);
      setNotice("Propriedade comprovada. O domínio já pode ser usado em novas varreduras.");
      setCreated(null);
      refresh();
    } catch (err) {
      const apiError = toApiError(err);
      setActionError(apiError.code === "VERIFICATION_PENDING"
        ? `${apiError.message} A verificação não criou nem enfileirou uma varredura.`
        : apiError.message);
    } finally {
      setBusyDomainId(null);
    }
  }

  async function handleArchive(domainId: number, domainHostname: string) {
    if (!window.confirm(`Arquivar ${domainHostname}? O histórico de varreduras será preservado.`)) return;
    setBusyDomainId(domainId);
    setActionError(null);
    setNotice(null);
    try {
      await archiveDomain(domainId);
      setNotice(`${domainHostname} foi arquivado. O registro e o histórico foram preservados.`);
      if (created?.id === domainId) setCreated(null);
      refresh();
    } catch (err) {
      setActionError(toApiError(err).message);
    } finally {
      setBusyDomainId(null);
    }
  }

  async function copyToken(token: string) {
    try {
      await navigator.clipboard.writeText(token);
      setNotice("Token copiado.");
    } catch {
      setNotice("Não foi possível copiar automaticamente. Selecione e copie o token manualmente.");
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-5 py-8 sm:px-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-1 text-xs uppercase tracking-[0.18em] text-sky-400">WebSec Inspector</p>
          <h1 className="text-2xl font-semibold text-slate-100">Meus domínios</h1>
          <p className="mt-1 text-sm text-slate-400">Cadastre, comprove e arquive domínios sem iniciar uma varredura.</p>
        </div>
        <Link to="/" className="rounded-md border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
          Voltar ao painel
        </Link>
      </header>

      <section className="mb-8 rounded-xl border border-white/10 bg-panel p-5 sm:p-6">
        <h2 className="mb-1 text-lg font-medium">Cadastrar domínio</h2>
        <p className="mb-5 text-sm text-slate-400">Informe um hostname ou uma URL HTTP/HTTPS. O cadastro não cria scans nem executa o ZAP.</p>
        <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-end">
          <div>
            <label htmlFor="domain-hostname" className="mb-2 block text-sm text-slate-300">Domínio ou URL</label>
            <input
              id="domain-hostname"
              value={hostname}
              onChange={(event) => setHostname(event.target.value)}
              required
              maxLength={2048}
              placeholder="example.com ou https://example.com"
              className="w-full rounded-md border border-white/10 bg-ink px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500"
            />
          </div>
          <div>
            <label htmlFor="target-user-id" className="mb-2 block text-sm text-slate-300">ID do proprietário (opcional)</label>
            <input
              id="target-user-id"
              inputMode="numeric"
              value={targetUserId}
              onChange={(event) => setTargetUserId(event.target.value.replace(/[^0-9]/g, ""))}
              placeholder="Sua própria conta"
              className="w-full rounded-md border border-white/10 bg-ink px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-sky-500"
            />
          </div>
          <button
            type="submit"
            disabled={creating || !hostname.trim()}
            className="rounded-md bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creating ? "Cadastrando..." : "Cadastrar"}
          </button>
        </form>
        <p className="mt-3 text-xs text-slate-500">O ID de outro proprietário só é aceito para gerente/administrador dentro do próprio escopo.</p>

        {notice && <p role="status" className="mt-4 rounded-md border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-200">{notice}</p>}
        {actionError && <p role="alert" className="mt-4 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{actionError}</p>}

        {created?.verificationToken && !created.verified && (
          <div className="mt-5 rounded-lg border border-white/10 bg-ink/70 p-4">
            <h3 className="mb-2 font-medium">Prova de propriedade de {created.hostname}</h3>
            <p className="mb-3 text-sm text-slate-400">Publique uma das opções abaixo. A emissão do token não verifica o domínio automaticamente.</p>
            <div className="mb-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Registro DNS TXT</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded bg-black/30 p-2 text-xs text-emerald-200">{created.verificationToken}</code>
                <button type="button" onClick={() => void copyToken(created.verificationToken!)} className="rounded border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">Copiar</button>
              </div>
            </div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Meta tag HTML</p>
            <code className="block break-all rounded bg-black/30 p-2 text-xs text-emerald-200">{`<meta name="websec-verification" content="${created.verificationToken}">`}</code>
            <p className="mt-3 text-xs text-slate-500">Após publicar a prova, use “Verificar” na lista abaixo. Em caso de propagação DNS, tente novamente mais tarde.</p>
          </div>
        )}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">Domínios ativos</h2>
            <p className="text-sm text-slate-400">A lista respeita o escopo do seu perfil.</p>
          </div>
          <button type="button" onClick={refresh} className="rounded-md border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">Atualizar lista</button>
        </div>

        {error && <p role="alert" className="mb-4 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error.message}</p>}
        {loading && domains.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Carregando domínios...</p>}
        {!loading && domains.length === 0 && !error && (
          <div className="rounded-xl border border-dashed border-white/15 p-8 text-center">
            <h3 className="font-medium">Nenhum domínio ativo</h3>
            <p className="mt-1 text-sm text-slate-400">Cadastre seu primeiro domínio no formulário acima.</p>
          </div>
        )}
        <ul className="space-y-3">
          {domains.map((domain) => (
            <li key={domain.id} className="rounded-xl border border-white/10 bg-panel p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="break-all font-medium text-slate-100">{domain.hostname}</h3>
                  <p className="mt-1 text-xs text-slate-500">ID #{domain.id}{domain.verifiedAt ? ` · verificado em ${new Date(domain.verifiedAt).toLocaleString("pt-BR")}` : " · aguardando comprovação"}</p>
                  <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs ${domain.verified ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-200"}`}>
                    {domain.verified ? "Verificado" : "Não verificado"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!domain.verified && (
                    <button type="button" onClick={() => void handleVerify(domain.id)} disabled={busyDomainId === domain.id} className="rounded-md bg-sky-500 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-400 disabled:opacity-50">
                      {busyDomainId === domain.id ? "Aguarde..." : "Verificar"}
                    </button>
                  )}
                  <button type="button" onClick={() => void handleArchive(domain.id, domain.hostname)} disabled={busyDomainId === domain.id} className="rounded-md border border-rose-400/30 px-3 py-2 text-xs text-rose-200 hover:bg-rose-500/10 disabled:opacity-50">
                    Arquivar
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
