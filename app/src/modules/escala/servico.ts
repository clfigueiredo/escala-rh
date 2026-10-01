/**
 * Serviços da escala: serialização de plantão e carga de dados para cálculo de
 * conflitos (plantões AGENDADO e ausências dos funcionários envolvidos).
 */
import type { Ausencia, Plantao, Prisma } from '@prisma/client';
import type { UsuarioSessao } from '../../auth/tipos';
import { podeAcessarSetor } from '../../auth/escopo';
import { type AusenciaRef, type Conflito, type IntervaloPlantao, calcularConflitos } from '../../lib/conflitos';
import { dataDoDb, dataParaDb, paraDataSP } from '../../lib/datas';
import { forbidden, notFound } from '../../lib/erros';
import { prisma } from '../../lib/prisma';

export type PlantaoExistente = IntervaloPlantao & { id: number; setorId: number };

export type Db = Pick<Prisma.TransactionClient, 'plantao' | 'ausencia'>;

export const incluirPlantao = {
  funcionario: { select: { id: true, nome: true } },
  setor: { select: { id: true, nome: true } },
  turno: { select: { id: true, nome: true, cor: true } },
} as const;

export type PlantaoCompleto = Plantao & {
  funcionario: { id: number; nome: string };
  setor: { id: number; nome: string };
  turno: { id: number; nome: string; cor: string } | null;
};

export function serializarPlantao(p: PlantaoCompleto, conflitos: Conflito[]) {
  return {
    id: p.id,
    funcionarioId: p.funcionarioId,
    setorId: p.setorId,
    turnoId: p.turnoId,
    inicio: p.inicio.toISOString(),
    fim: p.fim.toISOString(),
    status: p.status,
    origem: p.origem,
    observacao: p.observacao,
    funcionario: { id: p.funcionario.id, nome: p.funcionario.nome },
    setor: { id: p.setor.id, nome: p.setor.nome },
    turno: p.turno ? { id: p.turno.id, nome: p.turno.nome, cor: p.turno.cor } : null,
    conflitos,
  };
}

export function ausenciaParaRef(a: Pick<Ausencia, 'id' | 'funcionarioId' | 'tipo' | 'dataInicio' | 'dataFim'>): AusenciaRef {
  return {
    id: a.id,
    funcionarioId: a.funcionarioId,
    tipo: a.tipo,
    dataInicio: dataDoDb(a.dataInicio),
    dataFim: dataDoDb(a.dataFim),
  };
}

/**
 * Plantões AGENDADO e ausências dos `funcionarioIds` que tocam [inicio, fim).
 * Não aplica escopo de setor: conflito é do funcionário, independe de quem consulta.
 */
export async function carregarContextoConflitos(
  db: Db,
  funcionarioIds: number[],
  inicio: Date,
  fim: Date,
): Promise<{ existentes: PlantaoExistente[]; ausencias: AusenciaRef[] }> {
  if (funcionarioIds.length === 0) return { existentes: [], ausencias: [] };
  const ids = [...new Set(funcionarioIds)];
  const ultimo = fim.getTime() > inicio.getTime() ? new Date(fim.getTime() - 1) : inicio;
  const [existentes, ausencias] = await Promise.all([
    db.plantao.findMany({
      where: { funcionarioId: { in: ids }, status: 'AGENDADO', inicio: { lt: fim }, fim: { gt: inicio } },
      select: { id: true, funcionarioId: true, setorId: true, inicio: true, fim: true },
    }),
    db.ausencia.findMany({
      where: {
        funcionarioId: { in: ids },
        dataInicio: { lte: dataParaDb(paraDataSP(ultimo)) },
        dataFim: { gte: dataParaDb(paraDataSP(inicio)) },
      },
      select: { id: true, funcionarioId: true, tipo: true, dataInicio: true, dataFim: true },
    }),
  ]);
  return { existentes, ausencias: ausencias.map(ausenciaParaRef) };
}

/** Serializa plantões com `conflitos[]` (CANCELADO não tem conflito). */
export async function serializarComConflitos(db: Db, plantoes: PlantaoCompleto[]) {
  const agendados = plantoes.filter((p) => p.status === 'AGENDADO');
  if (agendados.length === 0) return plantoes.map((p) => serializarPlantao(p, []));
  const minInicio = new Date(Math.min(...agendados.map((p) => p.inicio.getTime())));
  const maxFim = new Date(Math.max(...agendados.map((p) => p.fim.getTime())));
  const ctx = await carregarContextoConflitos(
    db,
    agendados.map((p) => p.funcionarioId),
    minInicio,
    maxFim,
  );
  return plantoes.map((p) =>
    serializarPlantao(p, p.status === 'AGENDADO' ? calcularConflitos(p, ctx.existentes, ctx.ausencias) : []),
  );
}

/**
 * Carrega um plantão para escrita respeitando o escopo do GESTOR:
 * 404 se não existe; 403 se o setor do plantão ou o funcionário estão fora do escopo.
 */
export async function carregarPlantaoParaEscrita(usuario: UsuarioSessao, id: number) {
  const p = await prisma.plantao.findUnique({
    where: { id },
    include: { funcionario: { select: { setorId: true } } },
  });
  if (!p) throw notFound('Plantão não encontrado');
  if (!podeAcessarSetor(usuario, p.setorId) || !podeAcessarSetor(usuario, p.funcionario.setorId)) {
    throw forbidden('Sem permissão para este plantão');
  }
  return p;
}
