import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { mensagemDeErro } from '../api/client';

type TipoToast = 'sucesso' | 'erro' | 'info';

interface Toast {
  id: number;
  tipo: TipoToast;
  texto: string;
}

interface ToastApi {
  sucesso: (texto: string) => void;
  info: (texto: string) => void;
  erro: (e: unknown) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const remover = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const adicionar = useCallback(
    (tipo: TipoToast, texto: string) => {
      const id = ++seq.current;
      setToasts((t) => [...t.slice(-4), { id, tipo, texto }]);
      window.setTimeout(() => remover(id), tipo === 'erro' ? 7000 : 4000);
    },
    [remover],
  );

  const api = useMemo<ToastApi>(
    () => ({
      sucesso: (t) => adicionar('sucesso', t),
      info: (t) => adicionar('info', t),
      erro: (e) => adicionar('erro', typeof e === 'string' ? e : mensagemDeErro(e)),
    }),
    [adicionar],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tipo}`} onClick={() => remover(t.id)}>
            {t.texto}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast fora do ToastProvider');
  return c;
}
