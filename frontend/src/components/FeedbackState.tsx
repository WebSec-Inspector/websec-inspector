import React from "react";
import { ApiError, ApiErrorAction } from "../lib/apiError";

/** Painel neutro de estado — usado para loading, vazio e erro. */
export function StatePanel({
  title,
  children,
  tone = "neutral",
}: {
  title: string;
  children?: React.ReactNode;
  tone?: "neutral" | "danger";
}) {
  const border = tone === "danger" ? "border-risk-critical/40" : "border-white/10";
  const titleColor = tone === "danger" ? "text-risk-critical" : "text-slate-200";
  return (
    <div className={`rounded-xl border ${border} bg-panel p-8 text-center`}>
      <p className={`mb-2 text-sm font-medium ${titleColor}`}>{title}</p>
      {children && <div className="text-sm text-slate-400">{children}</div>}
    </div>
  );
}

export function LoadingPanel({ label = "Carregando..." }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-panel p-8 text-sm text-slate-400"
    >
      <span
        aria-hidden="true"
        className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent"
      />
      {label}
    </div>
  );
}

const actionLabels: Record<ApiErrorAction, string> = {
  retry: "Tentar novamente",
  login: "Fazer login novamente",
  dashboard: "Voltar ao Dashboard",
  back: "Voltar",
};

/**
 * Exibe um erro já normalizado junto das ações compatíveis com o cenário.
 * Só renderiza os botões para os quais a tela forneceu um handler.
 */
export function ErrorPanel({
  error,
  handlers,
  title = "Não foi possível concluir a operação",
}: {
  error: ApiError;
  handlers: Partial<Record<ApiErrorAction, () => void>>;
  title?: string;
}) {
  const available = error.actions.filter((action) => handlers[action]);

  return (
    <div
      role="alert"
      className="rounded-xl border border-risk-critical/40 bg-risk-critical/5 p-6 text-center"
    >
      <p className="mb-1 text-sm font-medium text-risk-critical">{title}</p>
      <p className="mb-4 text-sm text-slate-300">{error.message}</p>
      {error.status !== null && (
        <p className="mb-4 text-xs text-slate-500">Código HTTP {error.status}</p>
      )}
      {available.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {available.map((action, index) => (
            <button
              key={action}
              type="button"
              onClick={handlers[action]}
              className={
                index === 0
                  ? "rounded-md bg-accent px-4 py-2 text-sm font-medium text-ink hover:opacity-90"
                  : "rounded-md border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
              }
            >
              {actionLabels[action]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
