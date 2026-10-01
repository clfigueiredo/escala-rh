/**
 * /api/turnos — GET para todos; escrita só ADMIN.
 * Horas em "HH:mm" (fuso SP). `viraNoite` = horaFim <= horaInicio.
 */
import type { FastifyPluginAsync } from 'fastify';
import type { Turno } from '@prisma/client';
import { z } from 'zod';
import { requireAdmin, requireAuth } from '../../auth/guards';
import { viraNoite } from '../../lib/datas';
import { notFound } from '../../lib/erros';
import { prisma } from '../../lib/prisma';
import { boolQuery, corSchema, horaSchema, idParamSchema, textoObrigatorio } from '../../lib/validacao';

const criarSchema = z.object({
  nome: textoObrigatorio('Nome'),
  horaInicio: horaSchema,
  horaFim: horaSchema,
  cor: corSchema.default('#3b82f6'),
  ativo: z.boolean().default(true),
});
const atualizarSchema = z.object({
  nome: textoObrigatorio('Nome').optional(),
  horaInicio: horaSchema.optional(),
  horaFim: horaSchema.optional(),
  cor: corSchema.optional(),
  ativo: z.boolean().optional(),
});
const listarSchema = z.object({ ativo: boolQuery });

export function serializarTurno(t: Turno) {
  return {
    id: t.id,
    nome: t.nome,
    horaInicio: t.horaInicio,
    horaFim: t.horaFim,
    cor: t.cor,
    ativo: t.ativo,
    viraNoite: viraNoite(t.horaInicio, t.horaFim),
  };
}

const turnos: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get('/', async (request) => {
    const { ativo } = listarSchema.parse(request.query);
    const lista = await prisma.turno.findMany({
      where: ativo !== undefined ? { ativo } : {},
      orderBy: [{ horaInicio: 'asc' }, { nome: 'asc' }],
    });
    return lista.map(serializarTurno);
  });

  app.post('/', { onRequest: [requireAdmin] }, async (request, reply) => {
    const dados = criarSchema.parse(request.body);
    const t = await prisma.turno.create({ data: dados });
    return reply.code(201).send(serializarTurno(t));
  });

  app.put('/:id', { onRequest: [requireAdmin] }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const dados = atualizarSchema.parse(request.body);
    const existe = await prisma.turno.findUnique({ where: { id } });
    if (!existe) throw notFound('Turno não encontrado');
    const t = await prisma.turno.update({ where: { id }, data: dados });
    return serializarTurno(t);
  });
};

export default turnos;
