import { DateTime, Settings } from 'luxon';

/** Fuso único do sistema. Toda exibição é feita nele, independente do navegador. */
export const FUSO = 'America/Sao_Paulo';

Settings.defaultLocale = 'pt-BR';
Settings.defaultZone = FUSO;

export function sp(iso: string): DateTime {
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(FUSO);
}

export function agoraSP(): DateTime {
  return DateTime.now().setZone(FUSO);
}

/** ISO UTC → "dd/MM/yyyy HH:mm" em SP */
export function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  return sp(iso).toFormat('dd/MM/yyyy HH:mm');
}

/** ISO UTC → "HH:mm" em SP */
export function fmtHora(iso: string): string {
  return sp(iso).toFormat('HH:mm');
}

/** ISO UTC → "ccc dd/MM" (ex.: "seg 06/10") em SP */
export function fmtDiaCurto(iso: string): string {
  return sp(iso).toFormat('ccc dd/MM');
}

/** "YYYY-MM-DD" → "dd/MM/yyyy" */
export function fmtData(data: string | null | undefined): string {
  if (!data) return '—';
  const d = DateTime.fromISO(data.slice(0, 10), { zone: FUSO });
  return d.isValid ? d.toFormat('dd/MM/yyyy') : data;
}

/** ISO UTC → valor para <input type="datetime-local"> em SP ("yyyy-MM-ddTHH:mm") */
export function isoParaInputLocal(iso: string): string {
  return sp(iso).toFormat("yyyy-MM-dd'T'HH:mm");
}

/** Valor de <input type="datetime-local"> interpretado em SP → ISO UTC */
export function inputLocalParaIso(valor: string): string | null {
  if (!valor) return null;
  const d = DateTime.fromISO(valor, { zone: FUSO });
  return d.isValid ? d.toUTC().toISO() : null;
}

/** Data "YYYY-MM-DD" + hora "HH:mm" em SP → DateTime */
export function combinarDataHora(data: string, hora: string): DateTime {
  return DateTime.fromISO(`${data}T${hora}`, { zone: FUSO });
}

/**
 * Início/fim de um turno numa data (SP). Se o turno vira a noite
 * (horaFim <= horaInicio), o fim fica no dia seguinte.
 */
export function horarioDoTurno(data: string, horaInicio: string, horaFim: string) {
  const inicio = combinarDataHora(data, horaInicio);
  let fim = combinarDataHora(data, horaFim);
  if (horaFim <= horaInicio) fim = fim.plus({ days: 1 });
  return { inicio, fim };
}

export function hojeISO(): string {
  return agoraSP().toISODate() as string;
}

export function duracaoHoras(inicioIso: string, fimIso: string): number {
  return sp(fimIso).diff(sp(inicioIso), 'hours').hours;
}

export const DIAS_SEMANA_CURTO = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
