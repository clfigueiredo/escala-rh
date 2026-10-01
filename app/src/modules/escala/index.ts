/**
 * /api/escala — plantões (tabela `escala`) + gerador (`/gerar/previa`, `/gerar`).
 *
 * Escopo do GESTOR (regra 6):
 * - leitura: só plantões cujo setor está entre os dele;
 * - escrita: o setor do plantão E o setor do funcionário precisam estar entre os dele
 *   (antes e depois da alteração).
 * Conflitos (sobreposição/ausência) não bloqueiam a gravação manual; só são sinalizados.
 */
import type { FastifyPluginAsync } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { assertSetorPermitido, carregarFuncionarioPermitido, whereSetor } from '../../auth/escopo';
import { requireAuth } from '../../auth/guards';
import { badRequest } from '../../lib/erros';
import { prisma } from '../../lib/prisma';
import { idParamSchema, instanteSchema, intQuery, textoOpcional } from '../../lib/validacao';
import { rotasGerador } from './gerar';
import { carregarPlantaoParaEscrita, incluirPlantao, serializarComConflitos } from './servico';

/** Máximo de dias consultáveis de uma vez no GET. */
const MAX_DIAS_CONSULTA = 370;

const statusSchema = z.enum(['AGENDADO', 'CANCELADO'], { error: 'Status deve ser AGENDADO ou CANCELADO' });
const instante = (campo: string) => z.string({ error: `${campo} é obrigatório (ISO 8601)` }).pipe(instanteSchema);
const turnoIdSchema = z.number().int().positive().nullish();

const listarSchema = z.object({
  inicio: instante('inicio'),
  fim: instante('fim'),
  setorId: intQuery,
  funcionarioId: intQuery,
  status: statusSchema.optional(),
});
const criarSchema = z.object({
  funcionarioId: z.number({ error: 'Funcionário é obrigatório' }).int().positive(),
  setorId: z.number().int().positive().nullish(),
  turnoId: turnoIdSchema,
  inicio: instante('inicio'),
  fim: instante('fim'),
  observacao: textoOpcional,
});
const atualizarSchema = z.object({
  funcionarioId: z.number().int().positive().optional(),
  setorId: z.number().int().positive().optional(),
  turnoId: turnoIdSchema,
  inicio: instante('inicio').optional(),
  fim: instante('fim').optional(),
  status: statusSchema.optional(),
  observacao: textoOpcional.optional(),
});

function assertFimDepoisInicio(inicio: Date, fim: Date) {
  if (fim.getTime() <= inicio.getTime()) throw badRequest('O fim deve ser depois do início');
}

async function assertSetorExiste(setorId: number) {
  const s = await prisma.setor.findUnique({ where: { id: setorId } });
  if (!s) throw badRequest('Setor não encontrado');
}

async function assertTurnoExiste(turnoId: number) {
  const t = await prisma.turno.findUnique({ where: { id: turnoId } });
  if (!t) throw badRequest('Turno não encontrado');
}

const escala: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get('/', async (request) => {
    const q = listarSchema.parse(request.query);
    const u = request.usuario;
    assertFimDepoisInicio(q.inicio, q.fim);
    if (q.fim.getTime() - q.inicio.getTime() > MAX_DIAS_CONSULTA * 86_400_000) {
      throw badRequest(`Período máximo de consulta: ${MAX_DIAS_CONSULTA} dias`);
    }
    if (q.setorId) assertSetorPermitido(u, q.setorId);

    const and: Prisma.PlantaoWhereInput[] = [
      whereSetor(u),
      // sobrepõe [inicio, fim)
      { inicio: { lt: q.fim } },
      { fim: { gt: q.inicio } },
    ];
    if (q.setorId) and.push({ setorId: q.setorId });
    if (q.funcionarioId) and.push({ funcionarioId: q.funcionarioId });
    if (q.status) and.push({ status: q.status });

    const lista = await prisma.plantao.findMany({
      where: { AND: and },
      include: incluirPlantao,
      orderBy: [{ inicio: 'asc' }, { id: 'asc' }],
    });
    return serializarComConflitos(prisma, lista);
  });

  app.post('/', async (request, reply) => {
    const d = criarSchema.parse(request.body);
    const u = request.usuario;
    assertFimDepoisInicio(d.inicio, d.fim);
    const f = await carregarFuncionarioPermitido(u, d.funcionarioId, 'escrita');
    if (!f.ativo) throw badRequest('Funcionário inativo');
    const setorId = d.setorId ?? f.setorId;
    assertSetorPermitido(u, setorId);
    if (d.setorId) await assertSetorExiste(d.setorId);
    if (d.turnoId) await assertTurnoExiste(d.turnoId);

    const p = await prisma.plantao.create({
      data: {
        funcionarioId: f.id,
        setorId,
        turnoId: d.turnoId ?? null,
        inicio: d.inicio,
        fim: d.fim,
        status: 'AGENDADO',
        origem: 'MANUAL',
        observacao: d.observacao,
        criadoPorId: u.id,
      },
      include: incluirPlantao,
    });
    const [saida] = await serializarComConflitos(prisma, [p]);
    return reply.code(201).send(saida);
  });

  app.put('/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const d = atualizarSchema.parse(request.body);
    const u = request.usuario;
    const atual = await carregarPlantaoParaEscrita(u, id);

    const inicio = d.inicio ?? atual.inicio;
    const fim = d.fim ?? atual.fim;
    assertFimDepoisInicio(inicio, fim);

    const trocouFuncionario = d.funcionarioId !== undefined && d.funcionarioId !== atual.funcionarioId;
    if (trocouFuncionario) {
      const f = await carregarFuncionarioPermitido(u, d.funcionarioId!, 'escrita');
      if (!f.ativo) throw badRequest('Funcionário inativo');
    }
    if (d.setorId !== undefined && d.setorId !== atual.setorId) {
      assertSetorPermitido(u, d.setorId);
      await assertSetorExiste(d.setorId);
    }
    if (d.turnoId) await assertTurnoExiste(d.turnoId);

    const mudouHorario = inicio.getTime() !== atual.inicio.getTime() || fim.getTime() !== atual.fim.getTime();

    const p = await prisma.$transaction(async (tx) => {
      // Mudou horário (ou a pessoa) → os lembretes precisam ser enviados de novo para o novo plantão.
      if (mudouHorario || trocouFuncionario) {
        await tx.lembreteEnviado.deleteMany({ where: { escalaId: id } });
      }
      return tx.plantao.update({
        where: { id },
        data: {
          funcionarioId: d.funcionarioId,
          setorId: d.setorId,
          turnoId: d.turnoId,
          inicio: d.inicio,
          fim: d.fim,
          status: d.status,
          observacao: d.observacao,
        },
        include: incluirPlantao,
      });
    });
    const [saida] = await serializarComConflitos(prisma, [p]);
    return saida;
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await carregarPlantaoParaEscrita(request.usuario, id);
    // lembretes_enviados do plantão caem por cascade
    await prisma.plantao.delete({ where: { id } });
    return reply.code(204).send();
  });

  await app.register(rotasGerador, { prefix: '/gerar' });
};

export default escala;
