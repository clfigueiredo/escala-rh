/**
 * /api/escala/gerar/previa e /api/escala/gerar — gerador de escala por padrão + turno.
 * Lógica pura em lib/gerador.ts; aqui só validação, escopo e banco.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { assertSetorPermitido, podeAcessarSetor } from '../../auth/escopo';
import type { UsuarioSessao } from '../../auth/tipos';
import { diferencaDias, inicioDoDia, fimDoDiaExclusivo, somarDias } from '../../lib/datas';
import { badRequest, forbidden } from '../../lib/erros';
import {
  type ItemComConflitos,
  type ParametrosGeracao,
  calcularConflitosItens,
  gerarItens,
  planejarGeracao,
} from '../../lib/gerador';
import { prisma } from '../../lib/prisma';
import { dataSchema } from '../../lib/validacao';
import { type Db, carregarContextoConflitos } from './servico';

/** Período máximo do gerador (dias, inclusivo). */
export const MAX_DIAS_GERADOR = 93;

const gerarSchema = z.object({
  funcionarioIds: z
    .array(z.number().int().positive(), { error: 'Informe os funcionários' })
    .min(1, 'Selecione pelo menos um funcionário')
    .max(500, 'Selecione no máximo 500 funcionários por vez'),
  padraoId: z.number({ error: 'Padrão é obrigatório' }).int().positive(),
  turnoId: z.number({ error: 'Turno é obrigatório' }).int().positive(),
  dataInicioCiclo: dataSchema.nullish(),
  periodoInicio: dataSchema,
  periodoFim: dataSchema,
  setorId: z.number().int().positive().nullish(),
});
const executarSchema = gerarSchema.extend({
  modoConflito: z.enum(['PULAR', 'SUBSTITUIR'], { error: 'modoConflito deve ser PULAR ou SUBSTITUIR' }),
});

type GerarInput = z.infer<typeof gerarSchema>;

/** Valida a entrada contra o banco e o escopo do usuário; devolve parâmetros do gerador. */
async function prepararGeracao(usuario: UsuarioSessao, d: GerarInput): Promise<ParametrosGeracao> {
  if (d.periodoFim < d.periodoInicio) throw badRequest('O fim do período deve ser igual ou posterior ao início');
  if (diferencaDias(d.periodoInicio, d.periodoFim) + 1 > MAX_DIAS_GERADOR) {
    throw badRequest(`Período máximo para gerar: ${MAX_DIAS_GERADOR} dias`);
  }

  const padrao = await prisma.padraoEscala.findUnique({ where: { id: d.padraoId } });
  if (!padrao) throw badRequest('Padrão não encontrado');
  if (!padrao.ativo) throw badRequest('Padrão inativo');
  if (padrao.tipo === 'CICLO') {
    if (!d.dataInicioCiclo) throw badRequest('Informe a data de início do ciclo');
    if ((padrao.diasTrabalho ?? 0) < 1 || (padrao.diasFolga ?? -1) < 0) throw badRequest('Padrão de ciclo inválido');
  } else if (padrao.diasSemana.length === 0) {
    throw badRequest('Padrão semanal sem dias da semana');
  }

  const turno = await prisma.turno.findUnique({ where: { id: d.turnoId } });
  if (!turno) throw badRequest('Turno não encontrado');
  if (!turno.ativo) throw badRequest('Turno inativo');

  if (d.setorId) {
    assertSetorPermitido(usuario, d.setorId);
    const s = await prisma.setor.findUnique({ where: { id: d.setorId } });
    if (!s) throw badRequest('Setor não encontrado');
  }

  const ids = [...new Set(d.funcionarioIds)];
  const funcionarios = await prisma.funcionario.findMany({
    where: { id: { in: ids } },
    select: { id: true, nome: true, setorId: true, ativo: true },
  });
  if (funcionarios.length !== ids.length) throw badRequest('Funcionário não encontrado');
  const foraDoEscopo = funcionarios.filter((f) => !podeAcessarSetor(usuario, f.setorId));
  if (foraDoEscopo.length) throw forbidden('Sem permissão para um ou mais funcionários');
  const inativos = funcionarios.filter((f) => !f.ativo);
  if (inativos.length) {
    throw badRequest(`Funcionário inativo: ${inativos.map((f) => f.nome).join(', ')}`);
  }

  return {
    funcionarios: funcionarios.map(({ id, nome, setorId }) => ({ id, nome, setorId })),
    padrao: { tipo: padrao.tipo, diasTrabalho: padrao.diasTrabalho, diasFolga: padrao.diasFolga, diasSemana: padrao.diasSemana },
    turno: { id: turno.id, horaInicio: turno.horaInicio, horaFim: turno.horaFim },
    dataInicioCiclo: d.dataInicioCiclo ?? null,
    periodoInicio: d.periodoInicio,
    periodoFim: d.periodoFim,
    setorId: d.setorId ?? null,
  };
}

/** Gera os itens e calcula conflitos com o que está no banco (`db` pode ser a transação). */
async function montarPrevia(db: Db, p: ParametrosGeracao) {
  const itens = gerarItens(p);
  // janela: do início do período até o fim do dia seguinte ao último (turno que vira a noite)
  const ctx = await carregarContextoConflitos(
    db,
    p.funcionarios.map((f) => f.id),
    inicioDoDia(p.periodoInicio),
    fimDoDiaExclusivo(somarDias(p.periodoFim, 1)),
  );
  return {
    itens: calcularConflitosItens(itens, ctx.existentes, ctx.ausencias),
    setorDoExistente: new Map(ctx.existentes.map((e) => [e.id, e.setorId])),
  };
}

function serializarItem(i: ItemComConflitos) {
  return {
    funcionarioId: i.funcionarioId,
    funcionarioNome: i.funcionarioNome,
    inicio: i.inicio.toISOString(),
    fim: i.fim.toISOString(),
    conflitos: i.conflitos,
  };
}

export const rotasGerador: FastifyPluginAsync = async (app) => {
  app.post('/previa', async (request) => {
    const d = gerarSchema.parse(request.body);
    const params = await prepararGeracao(request.usuario, d);
    const { itens } = await montarPrevia(prisma, params);
    return {
      itens: itens.map(serializarItem),
      total: itens.length,
      comConflito: itens.filter((i) => i.conflitos.length > 0).length,
    };
  });

  app.post('/', async (request) => {
    const d = executarSchema.parse(request.body);
    const u = request.usuario;
    const params = await prepararGeracao(u, d);

    return prisma.$transaction(async (tx) => {
      const { itens, setorDoExistente } = await montarPrevia(tx, params);
      const plano = planejarGeracao(itens, d.modoConflito, (plantaoId) => {
        const setorId = setorDoExistente.get(plantaoId);
        return setorId !== undefined && podeAcessarSetor(u, setorId);
      });

      let substituidos = 0;
      if (plano.apagarIds.length) {
        // lembretes_enviados dos plantões apagados caem por cascade
        const r = await tx.plantao.deleteMany({ where: { id: { in: plano.apagarIds } } });
        substituidos = r.count;
      }

      let criados = 0;
      if (plano.criar.length) {
        const r = await tx.plantao.createMany({
          data: plano.criar.map((i) => ({
            funcionarioId: i.funcionarioId,
            setorId: i.setorId,
            turnoId: i.turnoId,
            inicio: i.inicio,
            fim: i.fim,
            status: 'AGENDADO' as const,
            origem: 'GERADO' as const,
            criadoPorId: u.id,
          })),
        });
        criados = r.count;
      }

      return { criados, pulados: plano.pulados, substituidos };
    });
  });
};
