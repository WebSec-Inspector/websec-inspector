import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DomainResponse, getDomains } from "../services/api";
import { ApiError, toApiError } from "../lib/apiError";
import { useAuth } from "./AuthContext";

const ACTIVE_DOMAIN_STORAGE_KEY = "websec_active_domain_id";

/**
 * Origem única do `domainId` no frontend.
 *
 * A issue #48 exige que o domainId tenha origem e ciclo de vida definidos, em
 * vez de estado implícito ou valor hardcoded. O ciclo é:
 *
 *  1. a lista de domínios vem de `GET /api/domains` (apenas os do usuário autenticado);
 *  2. o domínio ativo é escolhido entre os da lista — preferindo o último
 *     selecionado, depois o primeiro verificado, depois o primeiro da lista;
 *  3. a escolha é persistida em localStorage apenas como *dica*: ela só vale
 *     se o id ainda existir na lista devolvida pela API, o que evita chamadas
 *     com domainId inexistente;
 *  4. é descartada no logout.
 */
interface DomainContextValue {
  domains: DomainResponse[];
  activeDomainId: number | null;
  activeDomain: DomainResponse | null;
  /** Nenhum domínio verificado ainda — o Dashboard usa isso para orientar o usuário. */
  hasVerifiedDomain: boolean;
  loading: boolean;
  error: ApiError | null;
  refresh: () => void;
  selectDomain: (domainId: number) => void;
}

const DomainContext = createContext<DomainContextValue | undefined>(undefined);

function readStoredDomainId(): number | null {
  try {
    const raw = localStorage.getItem(ACTIVE_DOMAIN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function storeDomainId(domainId: number | null) {
  try {
    if (domainId === null) {
      localStorage.removeItem(ACTIVE_DOMAIN_STORAGE_KEY);
    } else {
      localStorage.setItem(ACTIVE_DOMAIN_STORAGE_KEY, String(domainId));
    }
  } catch {
    // localStorage indisponível (modo privado, por exemplo): segue em memória.
  }
}

/** Resolve qual domínio deve estar ativo, garantindo que o id exista na lista. */
function resolveActiveDomainId(
  domains: DomainResponse[],
  preferredId: number | null,
): number | null {
  if (domains.length === 0) return null;
  if (preferredId !== null && domains.some((d) => d.id === preferredId)) {
    return preferredId;
  }
  const firstVerified = domains.find((d) => d.verified);
  return (firstVerified ?? domains[0]).id;
}

export function DomainProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();

  const [domains, setDomains] = useState<DomainResponse[]>([]);
  const [activeDomainId, setActiveDomainId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const list = await getDomains();
      if (!mountedRef.current) return;
      setDomains(list);
      setActiveDomainId((current) => {
        const resolved = resolveActiveDomainId(list, current ?? readStoredDomainId());
        storeDomainId(resolved);
        return resolved;
      });
    } catch (err) {
      if (!mountedRef.current) return;
      setError(toApiError(err));
      setDomains([]);
      setActiveDomainId(null);
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // Carrega ao autenticar; descarta tudo ao sair.
  useEffect(() => {
    if (!token) {
      setDomains([]);
      setActiveDomainId(null);
      setError(null);
      setLoading(false);
      storeDomainId(null);
      return;
    }
    void load();
  }, [token, load]);

  const selectDomain = useCallback((domainId: number) => {
    setActiveDomainId((current) => {
      if (current === domainId) return current;
      storeDomainId(domainId);
      return domainId;
    });
  }, []);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  const value = useMemo<DomainContextValue>(() => {
    const activeDomain = domains.find((d) => d.id === activeDomainId) ?? null;
    return {
      domains,
      activeDomainId,
      activeDomain,
      hasVerifiedDomain: domains.some((d) => d.verified),
      loading,
      error,
      refresh,
      selectDomain,
    };
  }, [domains, activeDomainId, loading, error, refresh, selectDomain]);

  return <DomainContext.Provider value={value}>{children}</DomainContext.Provider>;
}

export function useDomains() {
  const ctx = useContext(DomainContext);
  if (!ctx) throw new Error("useDomains deve ser usado dentro de DomainProvider");
  return ctx;
}
