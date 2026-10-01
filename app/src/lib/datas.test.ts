import { describe, expect, it } from 'vitest';
import {
  combinarDataHora,
  dataDoDb,
  dataParaDb,
  dataValida,
  diaDaSemana,
  diaSemanaCurto,
  diaSemanaExtenso,
  diferencaDias,
  formatarData,
  formatarDataCompleta,
  formatarHora,
  fimDoDiaExclusivo,
  horaValida,
  inicioDoDia,
  intervaloTurno,
  listarDias,
  paraDataSP,
  sobrepoe,
  somarDias,
  viraNoite,
} from './datas';

// vitest.config.ts roda com TZ=UTC para garantir que nada depende do fuso do sistema.

describe('combinarDataHora', () => {
  it('interpreta data+hora em São Paulo (UTC-3)', () => {
    expect(combinarDataHora('2026-10-06', '07:00').toISOString()).toBe('2026-10-06T10:00:00.000Z');
    expect(combinarDataHora('2026-10-06', '23:30').toISOString()).toBe('2026-10-07T02:30:00.000Z');
    expect(combinarDataHora('2026-01-15', '00:00').toISOString()).toBe('2026-01-15T03:00:00.000Z');
  });
  it('rejeita entradas inválidas', () => {
    expect(() => combinarDataHora('2026-02-30', '07:00')).toThrow();
    expect(() => combinarDataHora('2026-10-06', '24:00')).toThrow();
  });
});

describe('intervaloTurno / viraNoite', () => {
  it('turno diurno termina no mesmo dia', () => {
    const { inicio, fim } = intervaloTurno('2026-10-06', '07:00', '19:00');
    expect(inicio.toISOString()).toBe('2026-10-06T10:00:00.000Z');
    expect(fim.toISOString()).toBe('2026-10-06T22:00:00.000Z');
  });
  it('turno noturno termina no dia seguinte', () => {
    const { inicio, fim } = intervaloTurno('2026-10-06', '19:00', '07:00');
    expect(inicio.toISOString()).toBe('2026-10-06T22:00:00.000Z');
    expect(fim.toISOString()).toBe('2026-10-07T10:00:00.000Z');
  });
  it('virada de mês/ano', () => {
    const { fim } = intervaloTurno('2026-12-31', '22:00', '06:00');
    expect(fim.toISOString()).toBe('2027-01-01T09:00:00.000Z');
  });
  it('viraNoite', () => {
    expect(viraNoite('19:00', '07:00')).toBe(true);
    expect(viraNoite('07:00', '07:00')).toBe(true);
    expect(viraNoite('07:00', '19:00')).toBe(false);
  });
});

describe('formatação em SP', () => {
  const d = new Date('2026-10-07T02:30:00.000Z'); // 06/10 23:30 em SP (terça)
  it('formata data/hora/dia da semana no fuso de SP', () => {
    expect(formatarData(d)).toBe('06/10');
    expect(formatarDataCompleta(d)).toBe('06/10/2026');
    expect(formatarHora(d)).toBe('23:30');
    expect(diaSemanaExtenso(d)).toBe('terça-feira');
    expect(diaSemanaCurto(d)).toBe('Ter');
    expect(paraDataSP(d)).toBe('2026-10-06');
  });
});

describe('datas puras', () => {
  it('soma e diferença de dias', () => {
    expect(somarDias('2026-10-31', 1)).toBe('2026-11-01');
    expect(somarDias('2026-10-01', -1)).toBe('2026-09-30');
    expect(diferencaDias('2026-10-01', '2026-10-31')).toBe(30);
    expect(diferencaDias('2026-10-05', '2026-10-01')).toBe(-4);
  });
  it('lista dias inclusivo', () => {
    expect(listarDias('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });
  it('dia da semana 0=domingo', () => {
    expect(diaDaSemana('2026-10-04')).toBe(0);
    expect(diaDaSemana('2026-10-06')).toBe(2);
    expect(diaDaSemana('2026-10-10')).toBe(6);
  });
  it('limites do dia em SP', () => {
    expect(inicioDoDia('2026-10-06').toISOString()).toBe('2026-10-06T03:00:00.000Z');
    expect(fimDoDiaExclusivo('2026-10-06').toISOString()).toBe('2026-10-07T03:00:00.000Z');
  });
  it('conversão de coluna date', () => {
    expect(dataParaDb('2026-10-06').toISOString()).toBe('2026-10-06T00:00:00.000Z');
    expect(dataDoDb(new Date('2026-10-06T00:00:00.000Z'))).toBe('2026-10-06');
  });
  it('validação', () => {
    expect(dataValida('2026-02-28')).toBe(true);
    expect(dataValida('2026-02-29')).toBe(false);
    expect(dataValida('06/10/2026')).toBe(false);
    expect(horaValida('07:00')).toBe(true);
    expect(horaValida('7:00')).toBe(false);
    expect(horaValida('23:59')).toBe(true);
  });
});

describe('sobrepoe', () => {
  const h = (s: string) => new Date(`2026-10-06T${s}:00.000Z`);
  it('intervalos semiabertos', () => {
    expect(sobrepoe(h('10:00'), h('12:00'), h('11:00'), h('13:00'))).toBe(true);
    expect(sobrepoe(h('10:00'), h('12:00'), h('12:00'), h('13:00'))).toBe(false);
  });
});
