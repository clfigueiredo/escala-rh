/**
 * Cálculo de conflitos de plantão (lógica pura, sem banco) — dono: agente ESCALA.
 *
 * - SOBREPOSICAO: o plantão sobrepõe (intervalo [inicio, fim)) outro plantão AGENDADO
 *   do mesmo funcionário.
 * - AUSENCIA: alguma data (em America/Sao_Paulo) tocada pelo plantão cai dentro de uma
 *   ausência do funcionário (dataInicio..dataFim, inclusivo). Um turno 19:00–07:00
 *   toca os dois dias de calendário.
 */
import { type DataISO, formatarData, formatarHora, paraDataSP, sobrepoe, somarDias } from './datas';

export type TipoConflito = 'SOBREPOSICAO' | 'AUSENCIA';

export interface Conflito {
  tipo: TipoConflito;
  descricao: string;
  /** Plantão existente envolvido (só SOBREPOSICAO com plantão já gravado). */
  plantaoId?: number;
}

export interface IntervaloPlantao {
  /** Ausente para plantões ainda não gravados (itens do gerador). */
  id?: number;
  funcionarioId: number;
  inicio: Date;
  fim: Date;
}

export interface AusenciaRef {
  id: number;
  funcionarioId: number;
  tipo: 'FERIAS' | 'ATESTADO' | 'FOLGA' | 'OUTRO';
  /** "YYYY-MM-DD" */
  dataInicio: DataISO;
  /** "YYYY-MM-DD" (inclusiva) */
  dataFim: DataISO;
}

const NOME_AUSENCIA: Record<AusenciaRef['tipo'], string> = {
  FERIAS: 'férias',
  ATESTADO: 'atestado',
  FOLGA: 'folga',
  OUTRO: 'ausência',
};

/** Datas de calendário (SP) tocadas por [inicio, fim). Sempre inclui a data do início. */
export function datasDoIntervalo(inicio: Date, fim: Date): DataISO[] {
  const primeira = paraDataSP(inicio);
  const ultimoInstante = fim.getTime() > inicio.getTime() ? new Date(fim.getTime() - 1) : inicio;
  const ultima = paraDataSP(ultimoInstante);
  const out: DataISO[] = [primeira];
  // "YYYY-MM-DD" compara lexicograficamente
  let atual = primeira;
  while (atual < ultima) {
    atual = somarDias(atual, 1);
    out.push(atual);
  }
  return out;
}

/** "06/10 19:00–07/10 07:00" (ou "06/10 07:00–19:00" no mesmo dia). */
export function descreverIntervalo(inicio: Date, fim: Date): string {
  const di = formatarData(inicio);
  const df = formatarData(fim);
  return di === df
    ? `${di} ${formatarHora(inicio)}–${formatarHora(fim)}`
    : `${di} ${formatarHora(inicio)}–${df} ${formatarHora(fim)}`;
}

function formatarDataPura(d: DataISO): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}`;
}

/** Conflitos de SOBREPOSICAO de `alvo` com `outros` (mesmo funcionário; ignora o próprio id). */
export function conflitosSobreposicao(alvo: IntervaloPlantao, outros: IntervaloPlantao[]): Conflito[] {
  const out: Conflito[] = [];
  for (const o of outros) {
    if (o.funcionarioId !== alvo.funcionarioId) continue;
    if (alvo.id !== undefined && o.id === alvo.id) continue;
    if (o === alvo) continue;
    if (!sobrepoe(alvo.inicio, alvo.fim, o.inicio, o.fim)) continue;
    const c: Conflito = {
      tipo: 'SOBREPOSICAO',
      descricao: `Sobrepõe outro plantão (${descreverIntervalo(o.inicio, o.fim)})`,
    };
    if (o.id !== undefined) c.plantaoId = o.id;
    out.push(c);
  }
  return out;
}

/** Conflitos de AUSENCIA de `alvo` (datas SP tocadas pelo plantão ∩ ausência). */
export function conflitosAusencia(alvo: IntervaloPlantao, ausencias: AusenciaRef[]): Conflito[] {
  const datas = datasDoIntervalo(alvo.inicio, alvo.fim);
  const out: Conflito[] = [];
  for (const a of ausencias) {
    if (a.funcionarioId !== alvo.funcionarioId) continue;
    if (!datas.some((d) => d >= a.dataInicio && d <= a.dataFim)) continue;
    const periodo =
      a.dataInicio === a.dataFim
        ? `em ${formatarDataPura(a.dataInicio)}`
        : `de ${formatarDataPura(a.dataInicio)} a ${formatarDataPura(a.dataFim)}`;
    out.push({ tipo: 'AUSENCIA', descricao: `Funcionário com ${NOME_AUSENCIA[a.tipo]} ${periodo}` });
  }
  return out;
}

/** Todos os conflitos de um plantão. */
export function calcularConflitos(
  alvo: IntervaloPlantao,
  outros: IntervaloPlantao[],
  ausencias: AusenciaRef[],
): Conflito[] {
  return [...conflitosSobreposicao(alvo, outros), ...conflitosAusencia(alvo, ausencias)];
}
