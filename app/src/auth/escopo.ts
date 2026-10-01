/**
 * Escopo de setor (regra 6 do CLAUDE.md): GESTOR só enxerga os setores
 * vinculados a ele; ADMIN vê tudo.
 *
 * Padrões de uso:
 * ```ts
 * // listagem: filtra no where do Prisma
 * const where = { ...whereSetor(request.usuario), ativo: true };
 * // listagem por relação (ex.: ausências → funcionário.setorId)
 * const where = { funcionario: whereSetor(request.usuario) };
 * // escrita com setorId vindo do corpo
 * assertSetorPermitido(request.usuario, body.setorId); // 403
 * // leitura/escrita de funcionário por id
 * const f = await carregarFuncionarioPermitido(request.usuario, id); // 404/403
 * ```
 */
import type { Funcionario } from '@prisma/client';
import { forbidden, notFound } from '../lib/erros';
import { prisma } from '../lib/prisma';
import type { UsuarioSessao } from './tipos';

/**
 * Setores que o usuário pode acessar.
 * @returns `null` = sem restrição (ADMIN); array (possivelmente vazio) para GESTOR.
 */
export function setoresPermitidos(usuario: UsuarioSessao): number[] | null {
  return usuario.perfil === 'ADMIN' ? null : usuario.setorIds;
}

/** true se o usuário pode acessar o setor. */
export function podeAcessarSetor(usuario: UsuarioSessao, setorId: number): boolean {
  const permitidos = setoresPermitidos(usuario);
  return permitidos === null || permitidos.includes(setorId);
}

/** Lança 403 se o usuário não pode acessar o setor. */
export function assertSetorPermitido(usuario: UsuarioSessao, setorId: number): void {
  if (!podeAcessarSetor(usuario, setorId)) {
    throw forbidden('Sem permissão para este setor');
  }
}

/**
 * Fragmento de `where` do Prisma para filtrar por setor.
 * ADMIN → `{}`; GESTOR → `{ [campo]: { in: setorIds } }`.
 * @param campo nome do campo no model (padrão `setorId`).
 */
export function whereSetor(usuario: UsuarioSessao): { setorId?: { in: number[] } };
export function whereSetor<const C extends string>(usuario: UsuarioSessao, campo: C): { [K in C]?: { in: number[] } };
export function whereSetor(usuario: UsuarioSessao, campo = 'setorId'): Record<string, { in: number[] }> {
  const permitidos = setoresPermitidos(usuario);
  if (permitidos === null) return {};
  return { [campo]: { in: permitidos } };
}

/**
 * Carrega um funcionário respeitando o escopo de setor.
 * - não existe → 404
 * - fora do escopo → 404 se `modo = 'leitura'` (padrão), 403 se `modo = 'escrita'`
 */
export async function carregarFuncionarioPermitido(
  usuario: UsuarioSessao,
  funcionarioId: number,
  modo: 'leitura' | 'escrita' = 'leitura',
): Promise<Funcionario> {
  const f = await prisma.funcionario.findUnique({ where: { id: funcionarioId } });
  if (!f) throw notFound('Funcionário não encontrado');
  if (!podeAcessarSetor(usuario, f.setorId)) {
    if (modo === 'escrita') throw forbidden('Sem permissão para este funcionário');
    throw notFound('Funcionário não encontrado');
  }
  return f;
}
