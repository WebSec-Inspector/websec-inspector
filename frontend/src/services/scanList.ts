import { api } from "./api";
import { invalidResponseError } from "../lib/apiError";
import { isKnownStatus, ScanStatus } from "../lib/scanStatus";

const severities = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"] as const;
export type ScannerSeverity = typeof severities[number];
export interface ScanListItem {
  id: number;
  domainId: number;
  hostname: string;
  name: string | null;
  status: ScanStatus;
  createdAt: string;
  finishedAt: string | null;
  findingsCount: number;
  maxSeverity: ScannerSeverity | null;
  domainActive: boolean;
}
export interface ScanListResult {
  content: ScanListItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}
export interface ScanListQuery {page: number; size: number; domainId?: number; status?: ScanStatus;}

const nonnegativeInteger = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
function parsePage(data: unknown): ScanListResult {
  if (!data || typeof data !== "object") throw invalidResponseError("página de varreduras inválida");
  const p = data as ScanListResult;
  if (!Array.isArray(p.content) || !nonnegativeInteger(p.page) || !nonnegativeInteger(p.size) || p.size < 1 || p.size > 100 ||
      !nonnegativeInteger(p.totalElements) || !nonnegativeInteger(p.totalPages) ||
      p.totalPages !== Math.ceil(p.totalElements / p.size) || p.content.length > p.size)
    throw invalidResponseError("paginação de varreduras inválida");
  const content = p.content.map(r => {
    if (!r || !nonnegativeInteger(r.id) || r.id < 1 || !nonnegativeInteger(r.domainId) || r.domainId < 1 ||
        typeof r.hostname !== "string" || !(r.name === null || typeof r.name === "string") ||
        !isKnownStatus(r.status) || typeof r.createdAt !== "string" || !Number.isFinite(Date.parse(r.createdAt)) ||
        !(r.finishedAt === null || (typeof r.finishedAt === "string" && Number.isFinite(Date.parse(r.finishedAt)))) ||
        !nonnegativeInteger(r.findingsCount) || typeof r.domainActive !== "boolean" ||
        !(r.maxSeverity === null || severities.includes(r.maxSeverity)))
      throw invalidResponseError("resumo de varredura inválido");
    return {id: r.id, domainId: r.domainId, hostname: r.hostname, name: r.name, status: r.status,
      createdAt: r.createdAt, finishedAt: r.finishedAt, findingsCount: r.findingsCount,
      maxSeverity: r.maxSeverity, domainActive: r.domainActive};
  });
  return {content, page: p.page, size: p.size, totalElements: p.totalElements, totalPages: p.totalPages};
}

export async function getScans(query: ScanListQuery, signal?: AbortSignal): Promise<ScanListResult> {
  return parsePage((await api.get("/scans", {params: query, signal})).data);
}
