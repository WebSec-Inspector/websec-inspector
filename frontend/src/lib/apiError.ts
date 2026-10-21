/**
 * Normaliza qualquer falha vinda do axios em um formato único, para que as
 * telas tratem cenários de erro de forma explícita em vez de cair em um
 * "Carregando..." infinito.
 *
 * Os tipos cobrem os cenários exigidos na issue #48: erro HTTP, timeout,
 * backend indisponível, recurso inexistente, resposta inválida, sessão
 * expirada e erro inesperado.
 */
export type ApiErrorKind =
  | "offline"
  | "timeout"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation"
  | "server"
  | "invalid_response"
  | "unknown";

/** Ação que a tela deve oferecer ao usuário diante do erro. */
export type ApiErrorAction = "retry" | "login" | "dashboard" | "back";

export interface ApiError {
  kind: ApiErrorKind;
  /** Mensagem pronta para exibição ao usuário. */
  message: string;
  /** Código de negócio devolvido pelo backend, quando houver (ex.: VERIFICATION_PENDING). */
  code: string | null;
  status: number | null;
  /** Ações sugeridas, em ordem de relevância. */
  actions: ApiErrorAction[];
}

interface AxiosLikeError {
  code?: string;
  message?: string;
  response?: {
    status?: number;
    data?: unknown;
  };
}

/** Extrai `error`/`code` do corpo sem assumir que o backend respondeu JSON válido. */
function readBody(data: unknown): { error: string | null; code: string | null } {
  if (!data || typeof data !== "object") return { error: null, code: null };
  const body = data as Record<string, unknown>;
  return {
    error: typeof body.error === "string" ? body.error : null,
    code: typeof body.code === "string" ? body.code : null,
  };
}

export function toApiError(err: unknown): ApiError {
  const axiosErr = (err ?? {}) as AxiosLikeError;
  const status = axiosErr.response?.status ?? null;
  const { error: serverMessage, code } = readBody(axiosErr.response?.data);

  // Sem `response`: a requisição não chegou a ser respondida.
  if (!axiosErr.response) {
    if (axiosErr.code === "ECONNABORTED" || axiosErr.code === "ETIMEDOUT") {
      return {
        kind: "timeout",
        message:
          "O servidor demorou demais para responder. Verifique se o backend está em execução e tente novamente.",
        code,
        status: null,
        actions: ["retry", "dashboard"],
      };
    }
    return {
      kind: "offline",
      message:
        "Não foi possível conectar ao servidor. Verifique sua conexão e se o backend está disponível.",
      code,
      status: null,
      actions: ["retry", "dashboard"],
    };
  }

  if (status === 401) {
    return {
      kind: "unauthorized",
      message: serverMessage ?? "Sua sessão expirou. Faça login novamente.",
      code,
      status,
      actions: ["login"],
    };
  }

  if (status === 403) {
    return {
      kind: "forbidden",
      message: serverMessage ?? "Você não tem permissão para acessar este recurso.",
      code,
      status,
      actions: ["dashboard"],
    };
  }

  if (status === 404) {
    return {
      kind: "not_found",
      message: serverMessage ?? "Registro não encontrado.",
      code,
      status,
      actions: ["dashboard"],
    };
  }

  if (status === 409) {
    return {
      kind: "conflict",
      message: serverMessage ?? "A operação não pôde ser concluída no estado atual.",
      code,
      status,
      actions: ["retry", "dashboard"],
    };
  }

  if (status === 400 || status === 422) {
    return {
      kind: "validation",
      message: serverMessage ?? "Dados inválidos. Revise as informações e tente novamente.",
      code,
      status,
      actions: ["back"],
    };
  }

  if (status !== null && status >= 500) {
    return {
      kind: "server",
      message: serverMessage ?? "O servidor encontrou um erro inesperado. Tente novamente em instantes.",
      code,
      status,
      actions: ["retry", "dashboard"],
    };
  }

  return {
    kind: "unknown",
    message: serverMessage ?? "Ocorreu um erro inesperado.",
    code,
    status,
    actions: ["retry", "dashboard"],
  };
}

/** Erro para quando a API responde 2xx com um corpo que não bate com o contrato. */
export function invalidResponseError(detail: string): ApiError {
  return {
    kind: "invalid_response",
    message: `A resposta do servidor não corresponde ao formato esperado (${detail}).`,
    code: null,
    status: null,
    actions: ["retry", "dashboard"],
  };
}

/** Sessão expirada exige logout/login, não nova tentativa. */
export function isSessionExpired(error: ApiError): boolean {
  return error.kind === "unauthorized";
}
