/**
 * /api/setores — GET para todos (gestor só os seus); escrita só ADMIN.
 */
import type { FastifyPluginAsync } from 'fastify';
import type { Setor } from '@prisma/client';
import { z } from 'zod';
import { whereSetor } from '../../auth/escopo';
import { requireAdmin, requireAuth } from '../../auth/guards';
import { notFound } from '../../lib/erros';
import { prisma } from '../../lib/prisma';
import { boolQuery, idParamSchema, textoObrigatorio } from '../../lib/validacao';

const criarSchema = z.object({
  nome: textoObrigatorio('Nome'),
  ativo: z.boolean().default(true),
});
const atualizarSchema = z.object({
  nome: textoObrigatorio('Nome').optional(),
  ativo: z.boolean().optional(),
});
const listarSchema = z.object({ ativo: boolQuery });

export function serializarSetor(s: Setor) {
  return { id: s.id, nome: s.nome, ativo: s.ativo };
}

const setores: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get('/', async (request) => {
    const { ativo } = listarSchema.parse(request.query);
    const lista = await prisma.setor.findMany({
      where: { ...whereSetor(request.usuario, 'id'), ...(ativo !== undefined && { ativo }) },
      orderBy: { nome: 'asc' },
    });
    return lista.map(serializarSetor);
  });

  app.post('/', { onRequest: [requireAdmin] }, async (request, reply) => {
    const dados = criarSchema.parse(request.body);
    const s = await prisma.setor.create({ data: dados });
    return reply.code(201).send(serializarSetor(s));
  });

  app.put('/:id', { onRequest: [requireAdmin] }, async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const dados = atualizarSchema.parse(request.body);
    const existe = await prisma.setor.findUnique({ where: { id } });
    if (!existe) throw notFound('Setor não encontrado');
    const s = await prisma.setor.update({ where: { id }, data: dados });
    return serializarSetor(s);
  });
};

export default setores;
