import type { Perfil } from '@prisma/client';

/** Usuário autenticado, recarregado do banco a cada request (formato do contrato da API). */
export interface UsuarioSessao {
  id: number;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  /** Setores vinculados (para ADMIN pode vir vazio — admin vê tudo). */
  setorIds: number[];
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Preenchido por `requireAuth`/`requireAdmin`. Não use em rotas sem guarda. */
    usuario: UsuarioSessao;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    /** `ver` = usuarios.sessao_versao na emissão (ausente em tokens antigos → 0). */
    payload: { sub: number; ver?: number };
    user: { sub: number; ver?: number };
  }
}
