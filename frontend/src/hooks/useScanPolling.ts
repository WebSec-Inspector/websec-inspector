import { useCallback, useEffect, useRef, useState } from "react";
import { getScan, ScanResponse } from "../services/api";
import { ApiError, isSessionExpired, toApiError } from "../lib/apiError";
import { pollIntervalMs, shouldKeepPolling } from "../lib/scanStatus";

/** Tentativas consecutivas de erro recuperável antes de desistir e mostrar o erro. */
const MAX_TRANSIENT_RETRIES = 3;
const TRANSIENT_RETRY_BASE_MS = 3_000;

/** Erros que podem ser transitórios: vale reagendar em vez de parar o fluxo. */
function isRecoverable(error: ApiError): boolean {
  return (
    error.kind === "offline" ||
    error.kind === "timeout" ||
    error.kind === "server" ||
    error.kind === "conflict"
  );
}

export interface ScanPollingState {
  scan: ScanResponse | null;
  /** Carregamento inicial: ainda não há nenhum dado para exibir. */
  loading: boolean;
  /** Erro que impede a exibição ou interrompeu a atualização automática. */
  error: ApiError | null;
  /** Verdadeiro enquanto o scan está em estado transitório e sendo acompanhado. */
  polling: boolean;
  /** Nova tentativa manual, usada pelo botão "tentar novamente". */
  reload: () => void;
}

/**
 * Acompanha um scan até um estado terminal.
 *
 * Garantias exigidas pela issue #48:
 *  - estados que exigem polling vêm de `shouldKeepPolling` (inclui
 *    PENDING_VERIFICATION, cuja ausência era o bug original);
 *  - um único timer por vez: todo agendamento passa por `schedule`, que
 *    sempre limpa o anterior;
 *  - nenhuma requisição concorrente: `inFlightRef` descarta chamadas
 *    sobrepostas;
 *  - parada em estado terminal, em erro não recuperável e ao desmontar;
 *  - nenhum `setState` após o desmonte.
 */
export function useScanPolling(scanId: number | null): ScanPollingState {
  const [scan, setScan] = useState<ScanResponse | null>(null);
  const [loading, setLoading] = useState(scanId !== null);
  const [error, setError] = useState<ApiError | null>(null);
  const [polling, setPolling] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const transientFailuresRef = useRef(0);
  /** Evita que o efeito recrie o ciclo a cada render; só o scanId reinicia. */
  const runRef = useRef<(() => void) | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const schedule = useCallback(
    (delayMs: number) => {
      clearTimer();
      if (!mountedRef.current || delayMs <= 0) return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        runRef.current?.();
      }, delayMs);
    },
    [clearTimer],
  );

  const tick = useCallback(async () => {
    if (scanId === null || !mountedRef.current) return;
    // Descarta a chamada se outra já está em andamento.
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    try {
      const data = await getScan(scanId);
      if (!mountedRef.current) return;

      transientFailuresRef.current = 0;
      setScan(data);
      setError(null);
      setLoading(false);

      if (shouldKeepPolling(data.status)) {
        setPolling(true);
        schedule(pollIntervalMs(data.status));
      } else {
        // Estado terminal: condição de parada.
        setPolling(false);
        clearTimer();
      }
    } catch (err) {
      if (!mountedRef.current) return;

      const apiError = toApiError(err);
      setLoading(false);

      if (isRecoverable(apiError) && !isSessionExpired(apiError)) {
        transientFailuresRef.current += 1;
        if (transientFailuresRef.current <= MAX_TRANSIENT_RETRIES) {
          // Mantém o dado anterior visível e tenta de novo com espera crescente.
          setPolling(true);
          schedule(TRANSIENT_RETRY_BASE_MS * transientFailuresRef.current);
          return;
        }
      }

      // Erro definitivo: para o polling e entrega o erro para a tela tratar.
      setPolling(false);
      clearTimer();
      setError(apiError);
    } finally {
      inFlightRef.current = false;
    }
  }, [scanId, schedule, clearTimer]);

  // Mantém `runRef` apontando para o tick atual sem reiniciar o ciclo.
  useEffect(() => {
    runRef.current = () => {
      void tick();
    };
  }, [tick]);

  const reload = useCallback(() => {
    if (scanId === null) return;
    transientFailuresRef.current = 0;
    clearTimer();
    setError(null);
    setLoading(scan === null);
    void tick();
  }, [scanId, clearTimer, tick, scan]);

  useEffect(() => {
    mountedRef.current = true;
    transientFailuresRef.current = 0;

    if (scanId === null) {
      setScan(null);
      setLoading(false);
      setPolling(false);
      setError(null);
      return () => {
        mountedRef.current = false;
        clearTimer();
      };
    }

    setScan(null);
    setError(null);
    setLoading(true);
    void tick();

    // Limpeza ao desmontar ou ao trocar de scan.
    return () => {
      mountedRef.current = false;
      inFlightRef.current = false;
      clearTimer();
    };
    // `tick` é estável para um mesmo scanId; incluí-lo reiniciaria o ciclo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId]);

  return { scan, loading, error, polling, reload };
}
