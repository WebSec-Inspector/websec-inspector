import axios from "axios";
import { invalidResponseError } from "../lib/apiError";
import { isKnownStatus, ScanStatus } from "../lib/scanStatus";

/** Timeout explícito: sem ele uma requisição pendurada deixa a tela em loading para sempre. */
const REQUEST_TIMEOUT_MS = 20_000;

export const TOKEN_STORAGE_KEY = "websec_token";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:8080/api",
  timeout: REQUEST_TIMEOUT_MS,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Só 401 derruba a sessão: 403 significa autenticado porém sem permissão,
    // e limpar o token nesse caso desloga o usuário por engano (vindo da main).
    if (err.response?.status === 401) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("websec:unauthorized"));
      }
    }
    return Promise.reject(err);
  },
);

export interface Finding {
  id: number;
  owaspCategory: string;
  description: string;
  cvssScore: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "INFORMATIONAL";
  recommendation: string;
  title: string;
  confidence: string | null;
  affectedUrl: string | null;
  affectedParameter: string | null;
  evidence: string | null;
  cweId: string | null;
  wascId: string | null;
  technicalReference: string | null;
  executionTimestamp: string | null;
}

export interface ScanResponse {
  id: number;
  /** Necessário para consultar o histórico sem recorrer a valor hardcoded. */
  domainId: number;
  hostname: string;
  name: string | null;
  status: ScanStatus;
  verificationToken: string | null;
  createdAt: string;
  finishedAt: string | null;
  findingsCount: number;
  findings: Finding[];
}

export interface DomainResponse {
  id: number;
  hostname: string;
  verified: boolean;
  verifiedAt: string | null;
  isActive: boolean;
}

export interface DomainCreateResponse extends DomainResponse {
  verificationToken: string | null;
}

/**
 * Valida o contrato antes de entregar o dado à tela. Um status desconhecido
 * quebraria a lógica de polling silenciosamente, e um `domainId` ausente
 * impediria a consulta do histórico — então ambos falham de forma explícita.
 */
function parseScan(data: unknown): ScanResponse {
  if (!data || typeof data !== "object") {
    throw invalidResponseError("corpo vazio ou não-objeto");
  }
  const raw = data as Record<string, unknown>;

  if (typeof raw.id !== "number") {
    throw invalidResponseError("campo 'id' ausente");
  }
  if (!isKnownStatus(raw.status)) {
    throw invalidResponseError(`status desconhecido '${String(raw.status)}'`);
  }
  if (typeof raw.domainId !== "number") {
    throw invalidResponseError("campo 'domainId' ausente");
  }

  return {
    id: raw.id,
    domainId: raw.domainId,
    name: typeof raw.name === "string" ? raw.name : null,
    hostname: typeof raw.hostname === "string" ? raw.hostname : "",
    status: raw.status,
    verificationToken: typeof raw.verificationToken === "string" ? raw.verificationToken : null,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
    finishedAt: typeof raw.finishedAt === "string" ? raw.finishedAt : null,
    findingsCount: typeof raw.findingsCount === "number" ? raw.findingsCount : (Array.isArray(raw.findings) ? raw.findings.length : 0),
    findings: Array.isArray(raw.findings) ? (raw.findings as Finding[]) : [],
  };
}

function parseDomain(data: unknown): DomainResponse {
  if (!data || typeof data !== "object") {
    throw invalidResponseError("domínio com corpo inválido");
  }
  const raw = data as Record<string, unknown>;
  if (typeof raw.id !== "number") {
    throw invalidResponseError("domínio sem 'id'");
  }
  return {
    id: raw.id,
    hostname: typeof raw.hostname === "string" ? raw.hostname : "",
    verified: raw.verified === true,
    verifiedAt: typeof raw.verifiedAt === "string" ? raw.verifiedAt : null,
    isActive: raw.isActive !== false,
  };
}

function parseDomainCreate(data: unknown): DomainCreateResponse {
  const domain = parseDomain(data);
  const raw = data as Record<string, unknown>;
  return { ...domain, verificationToken: typeof raw.verificationToken === "string" ? raw.verificationToken : null };
}

export async function login(email: string, password: string) {
  const { data } = await api.post("/auth/login", { email, password });
  return data as { token: string };
}

export async function register(name: string, email: string, password: string) {
  const { data } = await api.post("/auth/register", { name, email, password });
  return data as { token: string };
}

export async function submitScan(url: string, verificationChallengeId?: string) {
  const { data } = await api.post("/scans", { url, ...(verificationChallengeId ? {verificationChallengeId} : {}) });
  return parseScan(data);
}

export interface VerificationChallenge {
  id: string;
  token: string;
  createdAt: string;
  domainId: number | null;
  hostname: string | null;
}

function parseChallenge(data: unknown): VerificationChallenge {
  if (!data || typeof data !== "object") throw invalidResponseError("desafio inválido");
  const raw = data as Record<string,unknown>;
  if (typeof raw.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw.id) ||
      typeof raw.token !== "string" || !raw.token.startsWith("websec-verify-") ||
      typeof raw.createdAt !== "string" ||
      (raw.domainId !== null && typeof raw.domainId !== "number") ||
      (raw.hostname !== null && typeof raw.hostname !== "string")) throw invalidResponseError("contrato do desafio inválido");
  return raw as unknown as VerificationChallenge;
}

export async function getCurrentVerificationChallenge() {
  const response = await api.get("/verification-challenges/current");
  return response.status === 204 ? null : parseChallenge(response.data);
}
export async function issueVerificationChallenge() {
  return parseChallenge((await api.post("/verification-challenges",{})).data);
}
export async function getVerificationChallenge(id: string) {
  return parseChallenge((await api.get(`/verification-challenges/${encodeURIComponent(id)}`)).data);
}

export async function confirmVerification(scanId: number, signal?: AbortSignal, timeoutMs = REQUEST_TIMEOUT_MS) {
  const { data } = await api.post(`/scans/${scanId}/confirm-verification`, {}, {signal,timeout:Math.max(1,Math.min(REQUEST_TIMEOUT_MS,timeoutMs))});
  return parseScan(data);
}

export async function cancelVerification(scanId:number,signal?:AbortSignal){
  return parseScan((await api.post(`/scans/${scanId}/cancel-verification`,{}, {signal})).data);
}

export async function getScan(scanId: number) {
  const { data } = await api.get(`/scans/${scanId}`);
  return parseScan(data);
}

export interface ReportMetadata {
  status: 'NOT_REQUESTED' | 'PENDING' | 'GENERATING' | 'READY' | 'FAILED' | 'MISSING';
  generatedAt: string | null;
  generationVersion: number;
  failureCode: string | null;
}
function parseReport(data: unknown): ReportMetadata {
  const r=data as ReportMetadata;
  if (!r || !['NOT_REQUESTED','PENDING','GENERATING','READY','FAILED','MISSING'].includes(r.status) ||
      !Number.isInteger(r.generationVersion) || r.generationVersion<1 ||
      !(r.generatedAt===null || typeof r.generatedAt==='string') ||
      !(r.failureCode===null || typeof r.failureCode==='string')) throw invalidResponseError('estado do PDF inválido');
  return r;
}
export async function getReport(scanId:number,signal?:AbortSignal) {
  return parseReport((await api.get(`/scans/${scanId}/report`,{signal})).data);
}
export async function requestReport(scanId:number,signal?:AbortSignal) {
  return parseReport((await api.post(`/scans/${scanId}/report`,{}, {signal})).data);
}
export async function downloadReport(scanId:number,signal?:AbortSignal) {
  const response=await api.get<Blob>(`/scans/${scanId}/report/download`,{responseType:'blob',signal});
  if(!response.data.type.includes('application/pdf'))throw invalidResponseError('download não contém um PDF');
  return response.data;
}

/** Domínios do usuário autenticado — origem do `domainId` usado no Dashboard. */
export async function getDomains() {
  const { data } = await api.get("/domains");
  if (!Array.isArray(data)) {
    throw invalidResponseError("lista de domínios não é um array");
  }
  return data.map(parseDomain);
}

export async function createDomain(hostname: string, targetUserId?: number | null) {
  const { data } = await api.post("/domains", { hostname, targetUserId: targetUserId ?? null });
  return parseDomainCreate(data);
}

export async function verifyDomain(domainId: number) {
  const { data } = await api.post(`/domains/${domainId}/verify`);
  return parseDomain(data);
}

export async function archiveDomain(domainId: number) {
  await api.delete(`/domains/${domainId}`);
}

export async function getDomainHistory(domainId: number) {
  if (!Number.isInteger(domainId) || domainId <= 0) {
    // Guarda contra chamadas com domainId inexistente ou inválido.
    throw invalidResponseError(`domainId inválido '${String(domainId)}'`);
  }
  const { data } = await api.get(`/scans/domain/${domainId}/history`);
  if (!Array.isArray(data)) {
    throw invalidResponseError("histórico não é um array");
  }
  return data.map(parseScan);
}
