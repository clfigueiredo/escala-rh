/**
 * /api/padroes — GET para todos; escrita só ADMIN. Sem DELETE (desativar com ativo=false).
 * CICLO: diasTrabalho >= 1, diasFolga >= 0 (diasSemana vazio).
 * SEMANAL: diasSemana não vazio, valores 0..6 (diasTrabalho/diasFolga null).
 */
import type { FastifyPluginAsync } from 'fastify';
import type { PadraoEscala } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../../auth/guards';
import { badRequest, notFound } from '../../lib/erros';
import { prisma } from '../../lib/prisma';
import { boolQuery, idParamSchema, textoObrigatorio } from '../../lib/validacao';

const tipoSchema = z.enum(['CICLO', 'SEMANAL'], { error: 'Tipo deve ser CICLO ou SEMANAL' });
const diasSchema = z.number().int('Informe um número inteiro de dias').max(365, 'Máximo de 365 dias');
const diasSemanaSchema = z.array(
  z.number().int().min(0, 'Dia da semana deve ser de 0 a 6').max(6, 'Dia da semana deve ser de 0 a 6'),
);

const criarSchema = z.object({
  nome: textoObrigatorio('Nome'),
  tipo: tipoSchema,
  diasTrabalho: diasSchema.nullish(),
  diasFolga: diasSchema.nullish(),
  diasSemana: diasSemanaSchema.nullish(),
  ativo: z.boolean().default(true),
});
const atualizarSchema = z.object({
  nome: textoObrigatorio('Nome').optional(),
  tipo: tipoSchema.optional(),
  diasTrabalho: diasSchema.nullish(),
  diasFolga: diasSchema.nullish(),
  diasSemana: diasSemanaSchema.nullish(),
  ativo: z.boolean().optional(),
});
const listarSchema = z.object({ ativo: boolQuery });

export function serializarPadrao(p: PadraoEscala) {
  return {
    id: p.id,
    nome: p.nome,
    tipo: p.tipo,
    diasTrabalho: p.diasTrabalho,
    diasFolga: p.diasFolga,
    diasSemana: p.diasSemana,
    ativo: p.ativo,
  };
}

/** Valida as regras por tipo e devolve os campos normalizados para gravar. */
function normalizarRegras(d: {
  tipo: 'CICLO' | 'SEMANAL';
  diasTrabalho?: number | null;
  diasFolga?: number | null;
  diasSemana?: number[] | null;
}) {
  if (d.tipo === 'CICLO') {
    if (d.diasTrabalho == null || d.diasTrabalho < 1) throw badRequest('Ciclo exige pelo menos 1 dia de trabalho');
    if (d.diasFolga == null || d.diasFolga < 0) throw badRequest('Ciclo exige dias de folga (0 ou mais)');
    return { tipo: d.tipo, diasTrabalho: d.diasTrabalho, diasFolga: d.diasFolga, diasSemana: [] as number[] };
  }
  const dias = [...new Set(d.diasSemana ?? [])].sort((a, b) => a - b);
  if (dias.length === 0) throw badRequest('Padrão semanal exige pelo menos um dia da semana');
  return { tipo: d.tipo, diasTrabalho: null, diasFolga: null, diasSemana: dias };
}

const padroes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get('/', async (request) => {
    const { ativo } = listarSchema.parse(request.query);
    const lista = await prisma.padraoEscala.findMany({
      where: ativo !== undefined ? { ativo } : {},
      orderBy: { nome: 'asc' },
    });
    return lista.map(serializarPadrao);
  });

  app.post('/', { onRequest: [requireAdmin] }, async (request, reply) => {
    const d = criarSchema.parse(request.body);
    const p = await prisma.padraoEscala.create({
      data: { nome: d.nome, ativo: d.ativo, ...normalizarRegras(d) },
    });
    return reply.code(201).send(serializarPadrao(p));
  });

  app.put('/:id', { onRequest: [requireAdmin] }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const d = atualizarSchema.parse(request.body);
    const atual = await prisma.padraoEscala.findUnique({ where: { id } });
    if (!atual) throw notFound('Padrão não encontrado');
    const regras = normalizarRegras({
      tipo: d.tipo ?? atual.tipo,
      diasTrabalho: d.diasTrabalho !== undefined ? d.diasTrabalho : atual.diasTrabalho,
      diasFolga: d.diasFolga !== undefined ? d.diasFolga : atual.diasFolga,
      diasSemana: d.diasSemana !== undefined ? d.diasSemana : atual.diasSemana,
    });
    const p = await prisma.padraoEscala.update({
      where: { id },
      data: { nome: d.nome, ativo: d.ativo, ...regras },
    });
    return serializarPadrao(p);
  });
};

export default padroes;
