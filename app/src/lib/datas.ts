/**
 * Helpers de data/hora — SEMPRE no fuso America/Sao_Paulo (regra 2 do CLAUDE.md).
 *
 * Convenções:
 * - `DataISO`  = data pura "YYYY-MM-DD" (dia no calendário de SP).
 * - `HoraHHmm` = hora "HH:mm" (relógio de SP).
 * - Instantes (`Date`) são gravados como timestamptz e trafegam em ISO UTC.
 * - Colunas `@db.Date` do Prisma chegam como `Date` à meia-noite UTC:
 *   use `dataParaDb` / `dataDoDb` para converter.
 */
import { DateTime } from 'luxon';

export const ZONA = 'America/Sao_Paulo';

export type DataISO = string;
export type HoraHHmm = string;

export const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;
export const REGEX_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const DIAS_SEMANA_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** "HH:mm" válido (00:00–23:59). */
export function horaValida(h: string): boolean {
  return typeof h === 'string' && REGEX_HORA.test(h);
}

/** "YYYY-MM-DD" válido e existente no calendário. */
export function dataValida(d: string): boolean {
  return typeof d === 'string' && REGEX_DATA.test(d) && DateTime.fromISO(d, { zone: ZONA }).isValid;
}

function dataSP(data: DataISO): DateTime {
  const dt = DateTime.fromISO(data, { zone: ZONA });
  if (!REGEX_DATA.test(data) || !dt.isValid) throw new Error(`Data inválida: ${data}`);
  return dt.startOf('day');
}

function hm(hora: HoraHHmm): { hour: number; minute: number } {
  if (!horaValida(hora)) throw new Error(`Hora inválida: ${hora}`);
  const [h, m] = hora.split(':').map(Number);
  return { hour: h, minute: m };
}

/** Converte um instante para DateTime no fuso de SP. */
export function emSP(d: Date | string): DateTime {
  const dt = typeof d === 'string' ? DateTime.fromISO(d) : DateTime.fromJSDate(d);
  return dt.setZone(ZONA);
}

/** Agora, no fuso de SP. */
export function agoraSP(): DateTime {
  return DateTime.now().setZone(ZONA);
}

/** Data de hoje em SP ("YYYY-MM-DD"). */
export function hojeSP(): DataISO {
  return agoraSP().toISODate()!;
}

/**
 * Combina data (SP) + hora (SP) → instante UTC (`Date`).
 * Ex.: combinarDataHora("2026-10-06", "07:00") → 2026-10-06T10:00:00.000Z
 */
export function combinarDataHora(data: DataISO, hora: HoraHHmm): Date {
  return dataSP(data).set({ ...hm(hora), second: 0, millisecond: 0 }).toJSDate();
}

/** true se o turno atravessa a meia-noite (`horaFim <= horaInicio`). */
export function viraNoite(horaInicio: HoraHHmm, horaFim: HoraHHmm): boolean {
  return horaFim <= horaInicio;
}

/**
 * Início/fim de um turno que começa na `data` (SP). Se vira a noite,
 * o fim cai no dia seguinte. Ex.: 19:00–07:00 em 06/10 → fim 07/10 07:00.
 */
export function intervaloTurno(
  data: DataISO,
  horaInicio: HoraHHmm,
  horaFim: HoraHHmm,
): { inicio: Date; fim: Date } {
  const inicio = combinarDataHora(data, horaInicio);
  const dataFim = viraNoite(horaInicio, horaFim) ? somarDias(data, 1) : data;
  return { inicio, fim: combinarDataHora(dataFim, horaFim) };
}

/** Soma `n` dias (pode ser negativo) a uma data pura. */
export function somarDias(data: DataISO, n: number): DataISO {
  return dataSP(data).plus({ days: n }).toISODate()!;
}

/** Diferença em dias de calendário `b - a` (inteiro, pode ser negativo). */
export function diferencaDias(a: DataISO, b: DataISO): number {
  return Math.round(dataSP(b).diff(dataSP(a), 'days').days);
}

/** Lista as datas de `inicio` a `fim` (inclusivo). */
export function listarDias(inicio: DataISO, fim: DataISO): DataISO[] {
  const total = diferencaDias(inicio, fim);
  const out: DataISO[] = [];
  for (let i = 0; i <= total; i++) out.push(somarDias(inicio, i));
  return out;
}

/** Dia da semana de uma data pura: 0=domingo … 6=sábado. */
export function diaDaSemana(data: DataISO): number {
  return dataSP(data).weekday % 7;
}

/** Instante da meia-noite (SP) do dia → `Date` UTC. */
export function inicioDoDia(data: DataISO): Date {
  return dataSP(data).toJSDate();
}

/** Instante da meia-noite (SP) do dia seguinte (fim exclusivo do dia). */
export function fimDoDiaExclusivo(data: DataISO): Date {
  return dataSP(data).plus({ days: 1 }).toJSDate();
}

/** Data (SP) de um instante: "YYYY-MM-DD". */
export function paraDataSP(d: Date | string): DataISO {
  return emSP(d).toISODate()!;
}

/** "dd/MM" em SP. */
export function formatarData(d: Date | string): string {
  return emSP(d).toFormat('dd/MM');
}

/** "dd/MM/yyyy" em SP. */
export function formatarDataCompleta(d: Date | string): string {
  return emSP(d).toFormat('dd/MM/yyyy');
}

/** "HH:mm" em SP. */
export function formatarHora(d: Date | string): string {
  return emSP(d).toFormat('HH:mm');
}

/** Dia da semana por extenso em pt-BR ("segunda-feira"). */
export function diaSemanaExtenso(d: Date | string): string {
  return DIAS_SEMANA[emSP(d).weekday % 7];
}

/** Dia da semana abreviado em pt-BR ("Seg"). */
export function diaSemanaCurto(d: Date | string): string {
  return DIAS_SEMANA_CURTO[emSP(d).weekday % 7];
}

/** Nome do dia por índice (0=domingo). */
export function nomeDiaSemana(indice: number, curto = false): string {
  return (curto ? DIAS_SEMANA_CURTO : DIAS_SEMANA)[((indice % 7) + 7) % 7];
}

/** Data pura → valor para coluna `@db.Date` (meia-noite UTC). */
export function dataParaDb(data: DataISO): Date {
  if (!dataValida(data)) throw new Error(`Data inválida: ${data}`);
  return new Date(`${data}T00:00:00.000Z`);
}

/** Valor de coluna `@db.Date` → data pura "YYYY-MM-DD". */
export function dataDoDb(d: Date): DataISO {
  return d.toISOString().slice(0, 10);
}

/** true se os intervalos [aIni, aFim) e [bIni, bFim) se sobrepõem. */
export function sobrepoe(aIni: Date, aFim: Date, bIni: Date, bFim: Date): boolean {
  return aIni < bFim && bIni < aFim;
}
