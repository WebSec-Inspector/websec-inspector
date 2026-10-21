import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { submitScan, confirmVerification, getScan } from "../services/api";
import { useDomains } from "../context/DomainContext";
import { toApiError } from "../lib/apiError";

const POLL_INTERVAL_SECONDS = 15;

/** Query param que retoma a verificação de um scan já existente. */
export const RESUME_SCAN_PARAM = "scan";

export default function SubmitScanPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { selectDomain, refresh: refreshDomains } = useDomains();
  const [url, setUrl] = useState("");
  const [step, setStep] = useState<"form" | "verifying" | "resuming">("form");
  const [scanId, setScanId] = useState<number | null>(null);
  const [hostname, setHostname] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Estado da verificação automática: enquanto pendingMessage estiver
  // preenchido, o botão continua tentando em segundo plano até a
  // propagação do DNS/meta tag terminar, em vez de mostrar um erro fatal.
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [nextRetryIn, setNextRetryIn] = useState<number | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => clearPolling();
  }, []);

  /*
   * Retomada de uma verificação pendente. Sem isto, voltar da tela de
   * resultado para "Nova varredura" criaria um segundo scan e renovaria o
   * token do domínio, de modo que confirmar aqui nunca concluiria o scan
   * original.
   */
  useEffect(() => {
    const raw = searchParams.get(RESUME_SCAN_PARAM);
    if (!raw) return;

    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) {
      setError("Varredura inválida para retomar a verificação.");
      return;
    }

    let active = true;
    setStep("resuming");
    setError(null);

    (async () => {
      try {
        const scan = await getScan(id);
        if (!active) return;

        if (scan.status !== "PENDING_VERIFICATION") {
          // Já saiu da verificação: o lugar certo é a tela de resultado.
          navigate(`/scans/${scan.id}`, { replace: true });
          return;
        }

        setScanId(scan.id);
        setHostname(scan.hostname);
        setToken(scan.verificationToken ?? "");
        selectDomain(scan.domainId);
        setStep("verifying");
      } catch (err) {
        if (!active) return;
        setError(resolveErrorMessage(err));
        setStep("form");
      }
    })();

    return () => {
      active = false;
    };
  }, [searchParams, navigate, selectDomain]);

  function clearPolling() {
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    pollTimeoutRef.current = null;
    countdownRef.current = null;
    setNextRetryIn(null);
  }

  function schedulePoll() {
    clearPolling();
    setNextRetryIn(POLL_INTERVAL_SECONDS);
    countdownRef.current = setInterval(() => {
      setNextRetryIn((prev) => (prev && prev > 1 ? prev - 1 : 0));
    }, 1000);
    pollTimeoutRef.current = setTimeout(() => {
      attemptConfirm();
    }, POLL_INTERVAL_SECONDS * 1000);
  }

  function normalizeUrl(raw: string): string {
    let url = raw.trim();
    if (!url) return url;
    if (!/^https?:\/\//i.test(url)) {
      url = "https://" + url;
    }
    try {
      const parsed = new URL(url);
      if (parsed.hostname.startsWith("www.")) {
        parsed.hostname = parsed.hostname.slice(4);
        url = parsed.toString();
      }
    } catch {
      // keep as-is if URL parsing fails; backend will validate
    }
    return url;
  }

  /**
   * Validação local antes de gastar uma requisição: a URL precisa ser
   * parseável e apontar para um host com ponto (evita "localhost", "teste"
   * e endereços obviamente inválidos).
   */
  function validateUrl(raw: string): string | null {
    const trimmed = raw.trim();
    if (!trimmed) return "Informe a URL do site que deseja analisar.";

    let parsed: URL;
    try {
      parsed = new URL(normalizeUrl(trimmed));
    } catch {
      return "A URL informada não é válida. Exemplo: meusite.com.br";
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "Use um endereço http:// ou https://.";
    }
    if (!parsed.hostname.includes(".") || parsed.hostname.endsWith(".")) {
      return "Informe um domínio completo, como meusite.com.br.";
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validationError = validateUrl(url);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const normalized = normalizeUrl(url);
      const scan = await submitScan(normalized);
      setScanId(scan.id);
      setHostname(scan.hostname);
      setToken(scan.verificationToken ?? "");
      // Registra o domínio recém-criado como ativo: é daqui que o Dashboard
      // obtém o domainId usado na consulta do histórico.
      selectDomain(scan.domainId);
      refreshDomains();
      setStep("verifying");
    } catch (err: unknown) {
      setError(resolveErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  function resolveErrorMessage(err: unknown): string {
    return toApiError(err).message;
  }

  /**
   * Tenta confirmar a verificação. Se o backend responder que a propagação
   * ainda não terminou (VERIFICATION_PENDING), não trata como erro: mostra
   * um aviso e agenda uma nova tentativa automática, mantendo o usuário na
   * mesma tela até a verificação realmente passar.
   */
  async function attemptConfirm() {
    if (!scanId) return;
    setChecking(true);
    try {
      const scan = await confirmVerification(scanId);
      clearPolling();
      // O domínio acabou de ser marcado como verificado: atualiza a lista
      // para o Dashboard refletir o novo estado.
      selectDomain(scan.domainId);
      refreshDomains();
      navigate(`/scans/${scanId}`);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string; code?: string } } };
      const code = axiosErr?.response?.data?.code;
      if (code === "VERIFICATION_PENDING") {
        setError(null);
        setPendingMessage(
          axiosErr.response?.data?.error ??
            "Ainda não encontramos o registro de verificação. A propagação de DNS pode levar alguns minutos."
        );
        schedulePoll();
      } else {
        clearPolling();
        setPendingMessage(null);
        setError(resolveErrorMessage(err));
      }
    } finally {
      setChecking(false);
    }
  }

  function handleConfirmClick() {
    // Clique manual: tenta na hora e reinicia o ciclo de espera automática.
    attemptConfirm();
  }

  function handleCancelPolling() {
    clearPolling();
    setPendingMessage(null);
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-10">
      <h1 className="mb-6 text-xl font-semibold">Nova varredura de segurança</h1>

      {error && <p className="mb-4 text-sm text-risk-high">{error}</p>}

      {step === "resuming" && (
        <div className="rounded-xl border border-white/10 bg-panel p-6 text-sm text-slate-400">
          Carregando a verificação pendente...
        </div>
      )}

      {step === "form" && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-white/10 bg-panel p-6">
          <label className="mb-1 block text-sm text-slate-300">URL do site a analisar</label>
          <input
            className="mb-4 w-full rounded-md border border-white/10 bg-ink px-3 py-2 outline-none focus:border-accent"
            placeholder="meusite.com.br ou https://meusite.com.br"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
          <button
            className="w-full rounded-md bg-accent py-2 font-medium text-ink hover:opacity-90 disabled:opacity-60"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Enviando..." : "Continuar"}
          </button>
        </form>
      )}

      {step === "verifying" && (
        <div className="rounded-xl border border-white/10 bg-panel p-6 space-y-5">
          <h2 className="font-medium">Verifique a propriedade do domínio</h2>
          <p className="text-sm text-slate-400">
            Para garantir que apenas donos de domínio possam executar varreduras,
            prove que você controla <strong className="text-slate-200">{hostname}</strong> adicionando
            um dos registros abaixo.
          </p>

          <div className="rounded-lg border border-white/10 bg-ink p-4 space-y-3">
            <h3 className="text-sm font-medium text-slate-200">Opção 1 — Registro DNS TXT (recomendado)</h3>
            <ol className="list-decimal list-inside text-sm text-slate-400 space-y-2">
              <li>
                Acesse o painel de DNS do seu provedor (ex.: Registro.br, Cloudflare, GoDaddy).
              </li>
              <li>
                Crie um novo registro <strong className="text-slate-200">TXT</strong> no domínio:
                <div className="mt-1 flex items-center gap-2 rounded bg-panel px-3 py-1.5">
                  <code className="text-xs text-accent select-all flex-1">{hostname}</code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(hostname, "host")}
                    className="text-xs text-slate-400 hover:text-white shrink-0"
                  >
                    {copied === "host" ? "Copiado!" : "Copiar"}
                  </button>
                </div>
              </li>
              <li>
                No campo <em>Valor</em>, cole o token abaixo:
                <div className="mt-1 flex items-center gap-2 rounded bg-panel px-3 py-1.5">
                  <code className="text-xs text-accent select-all flex-1 break-all">{token}</code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(token, "token")}
                    className="text-xs text-slate-400 hover:text-white shrink-0"
                  >
                    {copied === "token" ? "Copiado!" : "Copiar"}
                  </button>
                </div>
              </li>
              <li>Salve e aguarde a propagação (pode levar alguns minutos).</li>
            </ol>
          </div>

          <div className="rounded-lg border border-white/10 bg-ink p-4 space-y-3">
            <h3 className="text-sm font-medium text-slate-200">Opção 2 — Meta tag HTML</h3>
            <p className="text-sm text-slate-400">
              Adicione a tag abaixo no <code className="text-accent">&lt;head&gt;</code> da página inicial do site:
            </p>
            <div className="flex items-center gap-2 rounded bg-panel px-3 py-1.5">
              <code className="text-xs text-accent select-all flex-1 break-all">
                {`<meta name="websec-verification" content="${token}" />`}
              </code>
              <button
                type="button"
                onClick={() => copyToClipboard(`<meta name="websec-verification" content="${token}" />`, "meta")}
                className="text-xs text-slate-400 hover:text-white shrink-0"
              >
                {copied === "meta" ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </div>

          {pendingMessage && (
            <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 space-y-2">
              <p className="text-sm text-amber-300">{pendingMessage}</p>
              {nextRetryIn !== null && (
                <p className="text-xs text-amber-300/80">
                  Nova tentativa automática em {nextRetryIn}s...
                </p>
              )}
              <button
                type="button"
                onClick={handleCancelPolling}
                className="text-xs text-slate-400 hover:text-white underline"
              >
                Cancelar verificação automática
              </button>
            </div>
          )}

          <button
            onClick={handleConfirmClick}
            disabled={checking}
            className="w-full rounded-md bg-accent py-2 font-medium text-ink hover:opacity-90 disabled:opacity-60"
          >
            {checking
              ? "Verificando..."
              : pendingMessage
              ? "Tentar agora"
              : "Já verifiquei, iniciar varredura"}
          </button>
        </div>
      )}
    </div>
  );
}
