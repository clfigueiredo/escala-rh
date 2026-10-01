import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { useToast } from '../contexts/ToastContext';

/**
 * Carrega dados de forma assíncrona, mostrando erro em toast.
 * Retorna [dados, carregando, recarregar].
 */
export function useCarregar<T>(fn: () => Promise<T>, deps: DependencyList, inicial: T) {
  const [dados, setDados] = useState<T>(inicial);
  const [carregando, setCarregando] = useState(true);
  const toast = useToast();
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const recarregar = useCallback(async () => {
    const meu = ++seq.current;
    setCarregando(true);
    try {
      const r = await fnRef.current();
      if (meu === seq.current) setDados(r);
    } catch (e) {
      if (meu === seq.current) toast.erro(e);
    } finally {
      if (meu === seq.current) setCarregando(false);
    }
  }, [toast]);

  useEffect(() => {
    void recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return [dados, carregando, recarregar, setDados] as const;
}

/** Executa `fn` a cada `ms` enquanto `ativo` for verdadeiro (também imediatamente). */
export function useIntervalo(fn: () => void, ms: number, ativo = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (!ativo) return;
    fnRef.current();
    const id = window.setInterval(() => fnRef.current(), ms);
    return () => window.clearInterval(id);
  }, [ms, ativo]);
}

/** Valor com atraso (para campos de busca). */
export function useDebounce<T>(valor: T, ms = 350): T {
  const [v, setV] = useState(valor);
  useEffect(() => {
    const id = window.setTimeout(() => setV(valor), ms);
    return () => window.clearTimeout(id);
  }, [valor, ms]);
  return v;
}
