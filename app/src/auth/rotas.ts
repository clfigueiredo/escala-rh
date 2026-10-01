/**
 * Rotas /api/auth — login, logout, me, troca de senha (docs/08-api.md).
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { HttpError, badRequest, unauthorized } from '../lib/erros';
import { prisma } from '../lib/prisma';
import { senhaNovaSchema } from '../lib/validacao';
import { bloqueioRestante, limparFalhas, registrarFalha } from './bloqueio';
import { requireAuth } from './guards';
import { COOKIE_SESSAO, gravarSessao, opcoesCookie, serializarUsuario } from './sessao';
import { HASH_FICTICIO, conferirSenha, gerarHashSenha } from './senha';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Informe o e-mail').max(254, 'E-mail muito longo'),
  senha: z.string().min(1, 'Informe a senha').max(200, 'Senha muito longa'),
});

const senhaSchema = z.object({
  senhaAtual: z.string().min(1, 'Informe a senha atual').max(200, 'Senha muito longa'),
  novaSenha: senhaNovaSchema('A nova senha deve ter ao menos 8 caracteres'),
});

/** Login e troca de senha: 5 tentativas por minuto por IP (+ bloqueio por conta no login). */
const LIMITE_TENTATIVAS = { rateLimit: { max: 5, timeWindow: '1 minute' } };

export const authRotas: FastifyPluginAsync = async (app) => {
  app.post(
    '/login',
    { config: LIMITE_TENTATIVAS },
    async (request, reply) => {
      const { email, senha } = loginSchema.parse(request.body);
      // Mesma resposta para e-mail existente ou não (não revela contas).
      const restante = bloqueioRestante(email);
      if (restante > 0) {
        throw new HttpError(429, `Muitas tentativas para este usuário. Tente novamente em ${Math.ceil(restante / 60_000)} min.`);
      }
      const u = await prisma.usuario.findUnique({
        where: { email },
        include: { setores: { select: { setorId: true } } },
      });
      const ok = await conferirSenha(senha, u?.senhaHash ?? HASH_FICTICIO);
      if (!u || !ok) {
        registrarFalha(email);
        throw unauthorized('E-mail ou senha inválidos');
      }
      limparFalhas(email);
      if (!u.ativo) throw unauthorized('Usuário desativado');
      await gravarSessao(reply, u.id, u.sessaoVersao ?? 0);
      return { usuario: serializarUsuario(u) };
    },
  );

  app.post('/logout', async (request, reply) => {
    // Revoga o JWT no servidor (não só apaga o cookie): incrementa sessao_versao se o
    // token ainda for o vigente. Sem cookie/token inválido → só limpa o cookie.
    try {
      const { sub, ver } = await request.jwtVerify<{ sub: number; ver?: number }>();
      const id = Number(sub);
      const versao = ver === undefined ? 0 : Number(ver);
      if (Number.isInteger(id) && Number.isInteger(versao)) {
        await prisma.usuario.updateMany({
          where: { id, sessaoVersao: versao },
          data: { sessaoVersao: { increment: 1 } },
        });
      }
    } catch {
      /* sem sessão válida: nada a revogar */
    }
    reply.clearCookie(COOKIE_SESSAO, opcoesCookie());
    return reply.code(204).send();
  });

  app.get('/me', { onRequest: [requireAuth] }, async (request) => {
    return { usuario: request.usuario };
  });

  app.post('/senha', { onRequest: [requireAuth], config: LIMITE_TENTATIVAS }, async (request, reply) => {
    const { senhaAtual, novaSenha } = senhaSchema.parse(request.body);
    const u = await prisma.usuario.findUniqueOrThrow({ where: { id: request.usuario.id } });
    if (!(await conferirSenha(senhaAtual, u.senhaHash))) {
      // 400 (não 401) para o painel não interpretar como sessão expirada
      throw badRequest('Senha atual incorreta');
    }
    // Troca a senha e revoga as outras sessões; a atual recebe um cookie novo.
    const atualizado = await prisma.usuario.update({
      where: { id: u.id },
      data: { senhaHash: await gerarHashSenha(novaSenha), sessaoVersao: { increment: 1 } },
      select: { id: true, sessaoVersao: true },
    });
    await gravarSessao(reply, atualizado.id, atualizado.sessaoVersao);
    return reply.code(204).send();
  });
};
