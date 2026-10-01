/**
 * /api/ausencias — férias, atestados, folgas. Escopo de setor do GESTOR (regra 6)
 * pelo setor do funcionário. Datas puras "YYYY-MM-DD"; dataFim inclusiva e >= dataInicio.
 */
import type { FastifyPluginAsync } from 'fastify';
import type { Ausencia, Prisma } from '@prisma/client';
import { z } from 'zod';
import { assertSetorPermitido, carregarFuncionarioPermitido, podeAcessarSetor, whereSetor } from '../../auth/escopo';
import { requireAuth } from '../../auth/guards';
import { dataDoDb, dataParaDb } from '../../lib/datas';
import { badRequest, forbidden, notFound } from '../../lib/erros';
import { prisma } from '../../lib/prisma';
import { dataSchema, idParamSchema, intQuery, textoOpcional } from '../../lib/validacao';

const tipoSchema = z.enum(['FERIAS', 'ATESTADO', 'FOLGA', 'OUTRO'], {
  error: 'Tipo deve ser FERIAS, ATESTADO, FOLGA ou OUTRO',
});

const criarSchema = z.object({
  funcionarioId: z.number({ error: 'Funcionário é obrigatório' }).int().positive(),
  tipo: tipoSchema,
  dataInicio: dataSchema,
  dataFim: dataSchema,
  observacao: textoOpcional,
});
const atualizarSchema = z.object({
  funcionarioId: z.number().int().positive().optional(),
  tipo: tipoSchema.optional(),
  dataInicio: dataSchema.optional(),
  dataFim: dataSchema.optional(),
  observacao: textoOpcional.optional(),
});
const listarSchema = z.object({
  funcionarioId: intQuery,
  setorId: intQuery,
  inicio: dataSchema.optional(),
  fim: dataSchema.optional(),
});

const incluirFuncionario = { funcionario: { select: { id: true, nome: true } } } as const;
type AusenciaComFuncionario = Ausencia & { funcionario: { id: number; nome: string } };

export function serializarAusencia(a: AusenciaComFuncionario) {
  return {
    id: a.id,
    funcionarioId: a.funcionarioId,
    funcionario: { id: a.funcionario.id, nome: a.funcionario.nome },
    tipo: a.tipo,
    dataInicio: dataDoDb(a.dataInicio),
    dataFim: dataDoDb(a.dataFim),
    observacao: a.observacao,
  };
}

function assertPeriodo(dataInicio: string, dataFim: string) {
  if (dataFim < dataInicio) throw badRequest('Data final deve ser igual ou posterior à data inicial');
}

const ausencias: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get('/', async (request) => {
    const q = listarSchema.parse(request.query);
    const u = request.usuario;
    if (q.setorId) assertSetorPermitido(u, q.setorId);
    if (q.inicio && q.fim) assertPeriodo(q.inicio, q.fim);

    const and: Prisma.AusenciaWhereInput[] = [{ funcionario: whereSetor(u) }];
    if (q.setorId) and.push({ funcionario: { setorId: q.setorId } });
    if (q.funcionarioId) and.push({ funcionarioId: q.funcionarioId });
    // sobrepõe [inicio, fim]: dataFim >= inicio E dataInicio <= fim
    if (q.inicio) and.push({ dataFim: { gte: dataParaDb(q.inicio) } });
    if (q.fim) and.push({ dataInicio: { lte: dataParaDb(q.fim) } });

    const lista = await prisma.ausencia.findMany({
      where: { AND: and },
      include: incluirFuncionario,
      orderBy: [{ dataInicio: 'asc' }, { id: 'asc' }],
    });
    return lista.map(serializarAusencia);
  });

  app.post('/', async (request, reply) => {
    const d = criarSchema.parse(request.body);
    assertPeriodo(d.dataInicio, d.dataFim);
    await carregarFuncionarioPermitido(request.usuario, d.funcionarioId, 'escrita');
    const a = await prisma.ausencia.create({
      data: {
        funcionarioId: d.funcionarioId,
        tipo: d.tipo,
        dataInicio: dataParaDb(d.dataInicio),
        dataFim: dataParaDb(d.dataFim),
        observacao: d.observacao,
      },
      include: incluirFuncionario,
    });
    return reply.code(201).send(serializarAusencia(a));
  });

  app.put('/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const d = atualizarSchema.parse(request.body);
    const atual = await carregarAusenciaParaEscrita(request.usuario, id);
    if (d.funcionarioId !== undefined && d.funcionarioId !== atual.funcionarioId) {
      await carregarFuncionarioPermitido(request.usuario, d.funcionarioId, 'escrita');
    }
    assertPeriodo(d.dataInicio ?? dataDoDb(atual.dataInicio), d.dataFim ?? dataDoDb(atual.dataFim));
    const a = await prisma.ausencia.update({
      where: { id },
      data: {
        funcionarioId: d.funcionarioId,
        tipo: d.tipo,
        dataInicio: d.dataInicio ? dataParaDb(d.dataInicio) : undefined,
        dataFim: d.dataFim ? dataParaDb(d.dataFim) : undefined,
        observacao: d.observacao,
      },
      include: incluirFuncionario,
    });
    return serializarAusencia(a);
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await carregarAusenciaParaEscrita(request.usuario, id);
    await prisma.ausencia.delete({ where: { id } });
    return reply.code(204).send();
  });
};

/** 404 se não existe; 403 se o funcionário da ausência está fora do escopo. */
async function carregarAusenciaParaEscrita(usuario: Parameters<typeof podeAcessarSetor>[0], id: number) {
  const a = await prisma.ausencia.findUnique({
    where: { id },
    include: { funcionario: { select: { setorId: true } } },
  });
  if (!a) throw notFound('Ausência não encontrada');
  if (!podeAcessarSetor(usuario, a.funcionario.setorId)) throw forbidden('Sem permissão para esta ausência');
  return a;
}

export default ausencias;
