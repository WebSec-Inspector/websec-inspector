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
  /**
   * Identidade do ciclo de polling. Troca a cada scanId novo e a cada reload.
   * Uma flag de montagem não serve aqui: ao trocar o ID da rota ela volta a
   * ser verdadeira, e a resposta do scan anterior passaria a valer para o
   * scan atual — inclusive cancelando o timer dele, caso viesse terminal.
   */
  const cycleRef = useRef(0);
  const tickRef = useRef<((cycle: number) => void) | null>(null);

  const isCurrent = useCallback(
    (cycle: number) => mountedRef.current && cycle === cycleRef.current,
    [],
  );

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const schedule = useCallback(
    (delayMs: number, cycle: number) => {
      if (!isCurrent(cycle)) return;
      clearTimer();
      if (delayMs <= 0) return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        tickRef.current?.(cycle);
      }, delayMs);
    },
    [clearTimer, isCurrent],
  );

  const tick = useCallback(
    async (cycle: number) => {
      if (scanId === null || !isCurrent(cycle)) return;
      // Descarta a chamada se outra já está em andamento.
      if (inFlightRef.current) return;

      inFlightRef.current = true;
      try {
        const data = await getScan(scanId);
        if (!isCurrent(cycle)) return;

        transientFailuresRef.current = 0;
        setScan(data);
        setError(null);
        setLoading(false);

        if (shouldKeepPolling(data.status)) {
          setPolling(true);
          schedule(pollIntervalMs(data.status), cycle);
        } else {
          // Estado terminal: condição de parada.
          setPolling(false);
          clearTimer();
        }
      } catch (err) {
        if (!isCurrent(cycle)) return;

        const apiError = toApiError(err);
        setLoading(false);

        if (isRecoverable(apiError) && !isSessionExpired(apiError)) {
          transientFailuresRef.current += 1;
          if (transientFailuresRef.current <= MAX_TRANSIENT_RETRIES) {
            // Mantém o dado anterior visível e tenta de novo com espera crescente.
            setPolling(true);
            schedule(TRANSIENT_RETRY_BASE_MS * transientFailuresRef.current, cycle);
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
    },
    [scanId, schedule, clearTimer, isCurrent],
  );

  // Mantém `tickRef` apontando para o tick atual sem reiniciar o ciclo.
  useEffect(() => {
    tickRef.current = (cycle: number) => {
      void tick(cycle);
    };
  }, [tick]);

  /** Abre um ciclo novo, invalidando qualquer resposta ou timer pendente. */
  const beginCycle = useCallback(() => {
    cycleRef.current += 1;
    transientFailuresRef.current = 0;
    inFlightRef.current = false;
    clearTimer();
    return cycleRef.current;
  }, [clearTimer]);

  const reload = useCallback(() => {
    if (scanId === null) return;
    const cycle = beginCycle();
    setError(null);
    setLoading(scan === null);
    void tick(cycle);
  }, [scanId, beginCycle, tick, scan]);

  useEffect(() => {
    mountedRef.current = true;
    const cycle = beginCycle();

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
    void tick(cycle);

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
