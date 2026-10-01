/**
 * Gerador de escala (lógica pura, sem banco) — dono: agente ESCALA.
 * Ver docs/02-arquitetura.md ("Geração de escala") e docs/08-api.md ("Gerador").
 *
 * - CICLO: dia trabalhado se `(dia - dataInicioCiclo) mod (diasTrabalho + diasFolga) < diasTrabalho`,
 *   com mod positivo (dias anteriores ao início do ciclo também seguem o ciclo).
 * - SEMANAL: dia da semana (0=dom … 6=sáb) ∈ diasSemana.
 * - Horários a partir do turno em America/Sao_Paulo (`intervaloTurno`); turno que
 *   vira a noite termina no dia seguinte.
 */
import { type Conflito, type AusenciaRef, type IntervaloPlantao, calcularConflitos } from './conflitos';
import { type DataISO, type HoraHHmm, diaDaSemana, diferencaDias, intervaloTurno, listarDias } from './datas';

export interface PadraoGerador {
  tipo: 'CICLO' | 'SEMANAL';
  diasTrabalho: number | null;
  diasFolga: number | null;
  diasSemana: number[];
}

export interface FuncionarioGerador {
  id: number;
  nome: string;
  setorId: number;
}

export interface TurnoGerador {
  id: number;
  horaInicio: HoraHHmm;
  horaFim: HoraHHmm;
}

export interface ItemGerado {
  funcionarioId: number;
  funcionarioNome: string;
  setorId: number;
  turnoId: number;
  /** Data (SP) em que o turno começa. */
  data: DataISO;
  inicio: Date;
  fim: Date;
}

export interface ItemComConflitos extends ItemGerado {
  conflitos: Conflito[];
}

/** Módulo sempre não-negativo. */
export function modPositivo(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/** true se `dia` é dia de trabalho no padrão. */
export function ehDiaDeTrabalho(padrao: PadraoGerador, dia: DataISO, dataInicioCiclo?: DataISO | null): boolean {
  if (padrao.tipo === 'CICLO') {
    const t = padrao.diasTrabalho ?? 0;
    const f = padrao.diasFolga ?? 0;
    if (t < 1 || f < 0) throw new Error('Padrão CICLO inválido');
    if (!dataInicioCiclo) throw new Error('dataInicioCiclo é obrigatória para padrão CICLO');
    return modPositivo(diferencaDias(dataInicioCiclo, dia), t + f) < t;
  }
  return padrao.diasSemana.includes(diaDaSemana(dia));
}

/** Datas de trabalho entre `periodoInicio` e `periodoFim` (inclusivo). */
export function diasDeTrabalho(
  padrao: PadraoGerador,
  periodoInicio: DataISO,
  periodoFim: DataISO,
  dataInicioCiclo?: DataISO | null,
): DataISO[] {
  return listarDias(periodoInicio, periodoFim).filter((d) => ehDiaDeTrabalho(padrao, d, dataInicioCiclo));
}

export interface ParametrosGeracao {
  funcionarios: FuncionarioGerador[];
  padrao: PadraoGerador;
  turno: TurnoGerador;
  dataInicioCiclo?: DataISO | null;
  periodoInicio: DataISO;
  periodoFim: DataISO;
  /** null/undefined → setor de cada funcionário. */
  setorId?: number | null;
}

/** Itens (plantões a criar) ordenados por início e nome. */
export function gerarItens(p: ParametrosGeracao): ItemGerado[] {
  const dias = diasDeTrabalho(p.padrao, p.periodoInicio, p.periodoFim, p.dataInicioCiclo);
  const itens: ItemGerado[] = [];
  for (const f of p.funcionarios) {
    for (const data of dias) {
      const { inicio, fim } = intervaloTurno(data, p.turno.horaInicio, p.turno.horaFim);
      itens.push({
        funcionarioId: f.id,
        funcionarioNome: f.nome,
        setorId: p.setorId ?? f.setorId,
        turnoId: p.turno.id,
        data,
        inicio,
        fim,
      });
    }
  }
  return itens.sort(
    (a, b) => a.inicio.getTime() - b.inicio.getTime() || a.funcionarioNome.localeCompare(b.funcionarioNome, 'pt-BR'),
  );
}

/**
 * Conflitos de cada item: com plantões existentes (AGENDADO, inclui `plantaoId`),
 * com ausências e com outros itens gerados do mesmo funcionário.
 */
export function calcularConflitosItens(
  itens: ItemGerado[],
  existentes: IntervaloPlantao[],
  ausencias: AusenciaRef[],
): ItemComConflitos[] {
  return itens.map((item, i) => {
    const conflitos = calcularConflitos(item, existentes, ausencias);
    for (let j = 0; j < itens.length; j++) {
      if (j === i) continue;
      const o = itens[j];
      if (o.funcionarioId === item.funcionarioId && item.inicio < o.fim && o.inicio < item.fim) {
        conflitos.push({ tipo: 'SOBREPOSICAO', descricao: 'Sobrepõe outro plantão gerado nesta mesma operação' });
      }
    }
    return { ...item, conflitos };
  });
}

export type ModoConflito = 'PULAR' | 'SUBSTITUIR';

export interface PlanoGeracao {
  criar: ItemGerado[];
  pulados: number;
  /** Plantões existentes a apagar (modo SUBSTITUIR). */
  apagarIds: number[];
}

/**
 * Decide o que criar/pular/apagar.
 * - PULAR: item com qualquer conflito é pulado.
 * - SUBSTITUIR: item com AUSENCIA é sempre pulado; sobreposição entre itens gerados também
 *   (não há o que substituir); sobreposição com plantão existente → apaga o existente e cria,
 *   desde que `podeApagar(plantaoId)` (ex.: escopo de setor do gestor) — senão pula.
 */
export function planejarGeracao(
  itens: ItemComConflitos[],
  modo: ModoConflito,
  podeApagar: (plantaoId: number) => boolean = () => true,
): PlanoGeracao {
  const criar: ItemGerado[] = [];
  const apagar = new Set<number>();
  let pulados = 0;
  for (const { conflitos, ...item } of itens) {
    if (conflitos.length === 0) {
      criar.push(item);
      continue;
    }
    if (modo === 'PULAR') {
      pulados++;
      continue;
    }
    const temAusencia = conflitos.some((c) => c.tipo === 'AUSENCIA');
    const semId = conflitos.some((c) => c.tipo === 'SOBREPOSICAO' && c.plantaoId === undefined);
    const ids = conflitos.filter((c) => c.plantaoId !== undefined).map((c) => c.plantaoId!);
    if (temAusencia || semId || !ids.every(podeApagar)) {
      pulados++;
      continue;
    }
    ids.forEach((id) => apagar.add(id));
    criar.push(item);
  }
  return { criar, pulados, apagarIds: [...apagar] };
}
