/**
 * Guardas de autenticação/perfil. Use como hook `onRequest`/`preHandler`:
 *
 * ```ts
 * // todas as rotas do plugin exigem login:
 * app.addHook('onRequest', requireAuth);
 * // só uma rota exige admin:
 * app.post('/', { onRequest: [requireAdmin] }, handler);
 * ```
 *
 * Após a guarda, `request.usuario` está preenchido (recarregado do banco a cada
 * request — usuário desativado perde o acesso na hora).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { forbidden, unauthorized } from '../lib/erros';
import { carregarUsuarioSessao } from './sessao';

/**
 * Exige sessão válida (cookie `sessao`), usuário ativo e `ver` do JWT igual a
 * `usuarios.sessao_versao` (sessão não revogada). Senão → 401.
 * Idempotente: se já rodou neste request, não consulta o banco de novo.
 */
export async function requireAuth(request: FastifyRequest, _reply?: FastifyReply): Promise<void> {
  if (request.usuario) return;
  let sub: number;
  let ver: number;
  try {
    const payload = await request.jwtVerify<{ sub: number; ver?: number }>();
    sub = Number(payload.sub);
    ver = payload.ver === undefined ? 0 : Number(payload.ver);
  } catch {
    throw unauthorized('Sessão inválida ou expirada');
  }
  if (!Number.isInteger(sub) || !Number.isInteger(ver)) throw unauthorized('Sessão inválida ou expirada');
  const r = await carregarUsuarioSessao(sub);
  if (!r || !r.usuario.ativo) throw unauthorized('Usuário inexistente ou desativado');
  // Sessão revogada (logout, troca de senha, alteração pelo admin)
  if (ver !== r.sessaoVersao) throw unauthorized('Sessão encerrada. Entre novamente.');
  request.usuario = r.usuario;
}

/** Exige sessão válida e perfil ADMIN. Sem sessão → 401; GESTOR → 403. */
export async function requireAdmin(request: FastifyRequest, reply?: FastifyReply): Promise<void> {
  await requireAuth(request, reply);
  if (request.usuario.perfil !== 'ADMIN') throw forbidden('Apenas administradores podem fazer isso');
}
