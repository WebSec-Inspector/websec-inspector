/**
 * Modelo explícito dos estados de um scan — base da correção do polling
 * descrita na issue #48.
 *
 * O bug original tratava apenas QUEUED e RUNNING como "ainda em andamento",
 * o que fazia a tela de resultado parar de consultar a API quando o scan
 * estava em PENDING_VERIFICATION e ficar presa nesse estado indefinidamente.
 * PENDING_VERIFICATION é transitório: ainda pode evoluir para QUEUED assim
 * que a verificação de propriedade do domínio for confirmada.
 */
export const SCAN_STATUSES = [
  "PENDING_VERIFICATION",
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
] as const;

export type ScanStatus = (typeof SCAN_STATUSES)[number];

/** Estados transitórios: o scan ainda pode mudar, então o polling continua. */
export const POLLING_STATUSES: readonly ScanStatus[] = [
  "PENDING_VERIFICATION",
  "QUEUED",
  "RUNNING",
];

/** Estados terminais: o polling deve parar. */
export const TERMINAL_STATUSES: readonly ScanStatus[] = ["COMPLETED", "FAILED"];

export function isKnownStatus(value: unknown): value is ScanStatus {
  return typeof value === "string" && (SCAN_STATUSES as readonly string[]).includes(value);
}

export function shouldKeepPolling(status: ScanStatus): boolean {
  return POLLING_STATUSES.includes(status);
}

export function isTerminal(status: ScanStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Intervalo de atualização por estado. PENDING_VERIFICATION depende de
 * propagação de DNS, que é lenta, então não faz sentido consultar a cada
 * 4 segundos como nos estados de execução.
 */
export function pollIntervalMs(status: ScanStatus): number {
  switch (status) {
    case "PENDING_VERIFICATION":
      return 15_000;
    case "QUEUED":
      return 5_000;
    case "RUNNING":
      return 4_000;
    default:
      return 0;
  }
}

export type ScanStatusTone = "pending" | "progress" | "success" | "danger";

interface StatusPresentation {
  label: string;
  tone: ScanStatusTone;
  description: string;
}

/** Cada estado tem rótulo, tom e descrição próprios para ter representação visual distinta. */
export const STATUS_PRESENTATION: Record<ScanStatus, StatusPresentation> = {
  PENDING_VERIFICATION: {
    label: "Aguardando verificação",
    tone: "pending",
    description:
      "A propriedade do domínio ainda não foi confirmada. A varredura começa automaticamente após a verificação.",
  },
  QUEUED: {
    label: "Na fila",
    tone: "progress",
    description: "A varredura foi aceita e aguarda um worker disponível.",
  },
  RUNNING: {
    label: "Em execução",
    tone: "progress",
    description: "O OWASP ZAP está analisando o domínio. Os resultados aparecem ao final.",
  },
  COMPLETED: {
    label: "Concluída",
    tone: "success",
    description: "A varredura terminou e os resultados abaixo estão completos.",
  },
  FAILED: {
    label: "Falhou",
    tone: "danger",
    description: "A varredura não pôde ser concluída. Tente executá-la novamente.",
  },
};

export function statusLabel(status: ScanStatus): string {
  return STATUS_PRESENTATION[status].label;
}
