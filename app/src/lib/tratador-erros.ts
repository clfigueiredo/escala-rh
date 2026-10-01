/**
 * Handler global de erros → `{ erro, detalhes? }` (contrato docs/08-api.md).
 * - HttpError → status próprio
 * - ZodError → 400 com lista de campos
 * - Prisma P2002 → 409, P2025 → 404, P2003 → 409, banco fora do ar → 503
 * - erros 4xx do Fastify (JSON malformado etc.) → status próprio, sem detalhes internos
 * - demais → 500 (logado)
 */
import { Prisma } from '@prisma/client';
import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { HttpError } from './erros';

export function registrarTratadorErros(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({
        erro: error.message,
        ...(error.detalhes !== undefined && { detalhes: error.detalhes }),
      });
    }

    if (error instanceof ZodError) {
      return reply.code(400).send({
        erro: error.issues[0]?.message ?? 'Dados inválidos',
        detalhes: error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
      });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
        case 'P2002':
          // Sem `meta.target`: não expõe nomes de colunas/índices do banco.
          return reply.code(409).send({ erro: 'Registro duplicado' });
        case 'P2025':
          return reply.code(404).send({ erro: 'Registro não encontrado' });
        case 'P2003':
          return reply.code(409).send({ erro: 'Registro vinculado a outro registro inexistente ou em uso' });
      }
    }

    if (error instanceof Prisma.PrismaClientInitializationError) {
      request.log.error({ err: error }, 'banco de dados indisponível');
      return reply.code(503).send({ erro: 'Banco de dados indisponível. Tente novamente em instantes.' });
    }

    const fe = error as FastifyError;
    const status = typeof fe.statusCode === 'number' ? fe.statusCode : 500;
    if (status >= 400 && status < 500) {
      const mensagens: Record<number, string> = {
        400: 'Requisição inválida',
        401: 'Não autenticado',
        403: 'Sem permissão',
        404: 'Não encontrado',
        413: 'Requisição muito grande',
        415: 'Tipo de conteúdo não suportado',
        429: 'Muitas requisições. Tente novamente em instantes.',
      };
      // Sem `fe.message`: detalhes internos de parsing ficam só no log.
      request.log.info({ err: error }, 'requisição rejeitada');
      return reply.code(status).send({ erro: mensagens[status] ?? 'Requisição inválida' });
    }

    request.log.error({ err: error }, 'erro não tratado');
    return reply.code(500).send({ erro: 'Erro interno do servidor' });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ erro: `Rota não encontrada: ${request.method} ${request.url.split('?')[0]}` });
  });
}
