import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi, type Usuario } from '../api';
import { definirHandlerNaoAutenticado } from '../api/client';

interface AuthApi {
  usuario: Usuario | null;
  carregando: boolean;
  ehAdmin: boolean;
  entrar: (email: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
}

const Ctx = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    // Qualquer 401 em chamadas autenticadas derruba a sessão (o roteador leva a /login).
    definirHandlerNaoAutenticado(() => setUsuario(null));
    authApi
      .me()
      .then((r) => setUsuario(r.usuario))
      .catch(() => setUsuario(null))
      .finally(() => setCarregando(false));
    return () => definirHandlerNaoAutenticado(null);
  }, []);

  const entrar = useCallback(async (email: string, senha: string) => {
    const r = await authApi.login(email, senha);
    setUsuario(r.usuario);
  }, []);

  const sair = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUsuario(null);
    }
  }, []);

  const valor = useMemo<AuthApi>(
    () => ({ usuario, carregando, ehAdmin: usuario?.perfil === 'ADMIN', entrar, sair }),
    [usuario, carregando, entrar, sair],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
}
