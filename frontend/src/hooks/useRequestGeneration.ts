import { useCallback, useEffect, useMemo, useRef } from "react";

/**
 * Invalida respostas de requisições que deixaram de ser relevantes.
 *
 * Um booleano de "montado" não basta quando o mesmo componente troca de
 * assunto — outro domínio selecionado, outro scan na rota, outra sessão após
 * login. A resposta antiga continua chegando e, sem geração, sobrescreve o
 * estado do assunto atual.
 *
 * Cada requisição captura o número da geração vigente em `start()`. Antes de
 * escrever qualquer estado, confirma com `isCurrent()` que nada mudou desde
 * então. `invalidate()` descarta tudo que estiver em voo sem iniciar nada.
 */
export interface RequestGeneration {
  /** Abre uma nova geração e devolve o identificador a ser validado depois. */
  start: () => number;
  /** Verdadeiro somente se a geração ainda é a atual e o componente está montado. */
  isCurrent: (generation: number) => boolean;
  /** Descarta as respostas em voo (troca de sessão, logout, desmonte lógico). */
  invalidate: () => void;
}

export function useRequestGeneration(): RequestGeneration {
  const generationRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const start = useCallback(() => {
    generationRef.current += 1;
    return generationRef.current;
  }, []);

  const isCurrent = useCallback(
    (generation: number) => mountedRef.current && generation === generationRef.current,
    [],
  );

  const invalidate = useCallback(() => {
    generationRef.current += 1;
  }, []);

  /*
   * A referência precisa ser estável. Devolvendo um objeto novo a cada
   * renderização, todo efeito que depende dele volta a rodar, atualiza estado
   * e provoca outra renderização — um ciclo que refaz a consulta sem parar.
   * As três funções já são estáveis; só faltava o invólucro.
   */
  return useMemo(
    () => ({ start, isCurrent, invalidate }),
    [start, isCurrent, invalidate],
  );
}
