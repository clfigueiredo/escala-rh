import type { Usuario, UsuarioSetor } from '@prisma/client';
import type { FastifyReply } from 'fastify';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import type { UsuarioSessao } from './tipos';

export const COOKIE_SESSAO = 'sessao';
/** Duração da sessão (JWT e cookie). */
export const DURACAO_SESSAO_SEGUNDOS = 12 * 60 * 60;

/** Converte o registro do banco no objeto `usuario` do contrato. */
export function serializarUsuario(u: Usuario & { setores: Pick<UsuarioSetor, 'setorId'>[] }): UsuarioSessao {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email,
    perfil: u.perfil,
    ativo: u.ativo,
    setorIds: u.setores.map((s) => s.setorId).sort((a, b) => a - b),
  };
}

/** Carrega o usuário (com setores) do banco; null se não existir. */
export async function carregarUsuario(id: number): Promise<UsuarioSessao | null> {
  const r = await carregarUsuarioSessao(id);
  return r ? r.usuario : null;
}

/** Como `carregarUsuario`, mas devolve também a versão atual da sessão (para validar o JWT). */
export async function carregarUsuarioSessao(
  id: number,
): Promise<{ usuario: UsuarioSessao; sessaoVersao: number } | null> {
  const u = await prisma.usuario.findUnique({
    where: { id },
    include: { setores: { select: { setorId: true } } },
  });
  return u ? { usuario: serializarUsuario(u), sessaoVersao: u.sessaoVersao ?? 0 } : null;
}

export function opcoesCookie() {
  return {
    path: '/',
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
  };
}

/** Emite o JWT (`sub` + `ver` = sessaoVersao) e grava o cookie `sessao`. */
export async function gravarSessao(reply: FastifyReply, usuarioId: number, sessaoVersao: number): Promise<void> {
  const token = await reply.jwtSign({ sub: usuarioId, ver: sessaoVersao }, { expiresIn: DURACAO_SESSAO_SEGUNDOS });
  reply.setCookie(COOKIE_SESSAO, token, { ...opcoesCookie(), maxAge: DURACAO_SESSAO_SEGUNDOS });
}

/**
 * Incrementa a versão da sessão do usuário (revoga todos os JWT já emitidos).
 * @returns a nova versão.
 */
export async function revogarSessoes(usuarioId: number): Promise<number> {
  const u = await prisma.usuario.update({
    where: { id: usuarioId },
    data: { sessaoVersao: { increment: 1 } },
    select: { sessaoVersao: true },
  });
  return u.sessaoVersao;
}
