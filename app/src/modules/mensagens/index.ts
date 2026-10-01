/**
 * /api/mensagens — histórico paginado (docs/08-api.md › Mensagens).
 * GESTOR só vê mensagens de funcionários dos seus setores (regra 6);
 * mensagens sem funcionário (números desconhecidos) só aparecem para ADMIN.
 */
import type { Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { setoresPermitidos } from '../../auth/escopo';
import { requireAuth } from '../../auth/guards';
import { prisma } from '../../lib/prisma';
import { instanteSchema, intQuery } from '../../lib/validacao';

const listarSchema = z.object({
  pagina: z.coerce.number().int().min(1, 'Página inválida').default(1),
  porPagina: z.coerce.number().int().min(1).max(200, 'porPagina máximo é 200').default(50),
  direcao: z.enum(['ENVIADA', 'RECEBIDA']).optional(),
  origem: z.enum(['LEMBRETE', 'BOT', 'MANUAL']).optional(),
  status: z.enum(['OK', 'FALHOU']).optional(),
  funcionarioId: intQuery,
  inicio: instanteSchema.optional(),
  fim: instanteSchema.optional(),
});

const plugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get('/', async (request) => {
    const q = listarSchema.parse(request.query);
    const permitidos = setoresPermitidos(request.usuario);

    const where: Prisma.MensagemWhereInput = {
      ...(q.direcao && { direcao: q.direcao }),
      ...(q.origem && { origem: q.origem }),
      ...(q.status && { status: q.status }),
      ...(q.funcionarioId && { funcionarioId: q.funcionarioId }),
      ...((q.inicio || q.fim) && {
        criadoEm: { ...(q.inicio && { gte: q.inicio }), ...(q.fim && { lte: q.fim }) },
      }),
      ...(permitidos !== null && { funcionario: { setorId: { in: permitidos } } }),
    };

    const [itens, total] = await Promise.all([
      prisma.mensagem.findMany({
        where,
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        skip: (q.pagina - 1) * q.porPagina,
        take: q.porPagina,
        include: { funcionario: { select: { id: true, nome: true } } },
      }),
      prisma.mensagem.count({ where }),
    ]);

    return {
      itens: itens.map((m) => ({
        id: m.id,
        direcao: m.direcao,
        telefone: m.telefone,
        funcionarioId: m.funcionarioId,
        funcionario: m.funcionario ? { id: m.funcionario.id, nome: m.funcionario.nome } : null,
        conteudo: m.conteudo,
        origem: m.origem,
        status: m.status,
        erro: m.erro,
        criadoEm: m.criadoEm.toISOString(),
      })),
      total,
    };
  });
};

export default plugin;
