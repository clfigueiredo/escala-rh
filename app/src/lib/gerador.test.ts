import { describe, expect, it } from 'vitest';
import { calcularConflitosItens, diasDeTrabalho, ehDiaDeTrabalho, gerarItens, modPositivo, planejarGeracao, type PadraoGerador } from './gerador';

const ciclo = (t: number, f: number): PadraoGerador => ({ tipo: 'CICLO', diasTrabalho: t, diasFolga: f, diasSemana: [] });
const semanal = (dias: number[]): PadraoGerador => ({ tipo: 'SEMANAL', diasTrabalho: null, diasFolga: null, diasSemana: dias });

describe('modPositivo', () => {
  it('é sempre >= 0', () => {
    expect(modPositivo(-1, 2)).toBe(1);
    expect(modPositivo(-7, 7)).toBe(0);
    expect(modPositivo(-8, 7)).toBe(6);
    expect(modPositivo(9, 7)).toBe(2);
  });
});

describe('CICLO', () => {
  it('12x36 (1/1) em outubro/2026: dias ímpares', () => {
    const dias = diasDeTrabalho(ciclo(1, 1), '2026-10-01', '2026-10-31', '2026-10-01');
    expect(dias).toHaveLength(16);
    expect(dias.slice(0, 3)).toEqual(['2026-10-01', '2026-10-03', '2026-10-05']);
    expect(dias.at(-1)).toBe('2026-10-31');
  });

  it('6x1 em outubro/2026: folga a cada 7º dia', () => {
    const dias = diasDeTrabalho(ciclo(6, 1), '2026-10-01', '2026-10-31', '2026-10-01');
    expect(dias).toHaveLength(27);
    for (const folga of ['2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28']) expect(dias).not.toContain(folga);
    expect(dias).toContain('2026-10-29');
  });

  it('datas anteriores ao início do ciclo seguem o ciclo (mod positivo)', () => {
    const p = ciclo(1, 1);
    expect(ehDiaDeTrabalho(p, '2026-10-10', '2026-10-10')).toBe(true);
    expect(ehDiaDeTrabalho(p, '2026-10-09', '2026-10-10')).toBe(false);
    expect(ehDiaDeTrabalho(p, '2026-10-08', '2026-10-10')).toBe(true);
    const s = ciclo(6, 1);
    expect(ehDiaDeTrabalho(s, '2026-10-09', '2026-10-10')).toBe(false); // -1 mod 7 = 6 → folga
    expect(ehDiaDeTrabalho(s, '2026-10-03', '2026-10-10')).toBe(true); // -7 mod 7 = 0
    expect(ehDiaDeTrabalho(s, '2026-10-02', '2026-10-10')).toBe(false); // -8 mod 7 = 6
    // período inteiro antes do início do ciclo
    expect(diasDeTrabalho(p, '2026-09-01', '2026-09-06', '2026-10-01')).toEqual(['2026-09-01', '2026-09-03', '2026-09-05']) // setembro tem 30 dias (par);
  });

  it('exige dataInicioCiclo', () => {
    expect(() => ehDiaDeTrabalho(ciclo(1, 1), '2026-10-01')).toThrow();
  });
});

describe('SEMANAL', () => {
  it('5x2 (seg–sex) em outubro/2026 = 22 dias úteis', () => {
    const dias = diasDeTrabalho(semanal([1, 2, 3, 4, 5]), '2026-10-01', '2026-10-31');
    expect(dias).toHaveLength(22);
    expect(dias).not.toContain('2026-10-03'); // sábado
    expect(dias).not.toContain('2026-10-04'); // domingo
    expect(dias).toContain('2026-10-05'); // segunda
  });
});

describe('gerarItens', () => {
  const base = {
    funcionarios: [{ id: 1, nome: 'Ana', setorId: 10 }],
    padrao: ciclo(1, 1),
    dataInicioCiclo: '2026-10-01',
    periodoInicio: '2026-10-29',
    periodoFim: '2026-10-31',
  };

  it('turno 07:00–19:00 no fuso de SP', () => {
    const itens = gerarItens({ ...base, turno: { id: 5, horaInicio: '07:00', horaFim: '19:00' } });
    expect(itens.map((i) => i.inicio.toISOString())).toEqual(['2026-10-29T10:00:00.000Z', '2026-10-31T10:00:00.000Z']);
    expect(itens[0].fim.toISOString()).toBe('2026-10-29T22:00:00.000Z');
    expect(itens[0]).toMatchObject({ funcionarioId: 1, funcionarioNome: 'Ana', setorId: 10, turnoId: 5, data: '2026-10-29' });
  });

  it('turno 19:00–07:00 atravessa a meia-noite e a virada do mês', () => {
    const itens = gerarItens({ ...base, turno: { id: 6, horaInicio: '19:00', horaFim: '07:00' } });
    const ultimo = itens.at(-1)!;
    expect(ultimo.inicio.toISOString()).toBe('2026-10-31T22:00:00.000Z');
    expect(ultimo.fim.toISOString()).toBe('2026-11-01T10:00:00.000Z');
  });

  it('setorId informado sobrepõe o setor do funcionário', () => {
    const itens = gerarItens({ ...base, setorId: 99, turno: { id: 5, horaInicio: '07:00', horaFim: '19:00' } });
    expect(itens.every((i) => i.setorId === 99)).toBe(true);
  });
});

describe('conflitos da prévia e plano', () => {
  const turno = { id: 6, horaInicio: '19:00', horaFim: '07:00' };
  const itens = gerarItens({
    funcionarios: [{ id: 1, nome: 'Ana', setorId: 10 }],
    padrao: ciclo(1, 1),
    turno,
    dataInicioCiclo: '2026-10-01',
    periodoInicio: '2026-10-01',
    periodoFim: '2026-10-05',
  }); // 01, 03, 05

  const existentes = [
    // 02/10 04:00–08:00 SP → sobrepõe o plantão noturno de 01/10
    { id: 9, funcionarioId: 1, inicio: new Date('2026-10-02T07:00:00Z'), fim: new Date('2026-10-02T11:00:00Z') },
    // de outro funcionário: ignorado
    { id: 10, funcionarioId: 2, inicio: new Date('2026-10-03T22:00:00Z'), fim: new Date('2026-10-04T10:00:00Z') },
  ];
  // ausência começa em 06/10: o plantão de 05/10 (19:00 → 06/10 07:00) toca o dia 06
  const ausencias = [{ id: 1, funcionarioId: 1, tipo: 'FERIAS' as const, dataInicio: '2026-10-06', dataFim: '2026-10-10' }];

  const comConflitos = calcularConflitosItens(itens, existentes, ausencias);

  it('marca sobreposição (com plantaoId) e ausência', () => {
    expect(comConflitos[0].conflitos).toEqual([expect.objectContaining({ tipo: 'SOBREPOSICAO', plantaoId: 9 })]);
    expect(comConflitos[1].conflitos).toEqual([]);
    expect(comConflitos[2].conflitos).toEqual([expect.objectContaining({ tipo: 'AUSENCIA' })]);
    expect(comConflitos[2].conflitos[0].descricao).toMatch(/férias de 06\/10 a 10\/10/);
  });

  it('PULAR pula tudo que tem conflito', () => {
    const plano = planejarGeracao(comConflitos, 'PULAR');
    expect(plano).toMatchObject({ pulados: 2, apagarIds: [] });
    expect(plano.criar).toHaveLength(1);
  });

  it('SUBSTITUIR apaga o sobreposto mas pula ausência', () => {
    const plano = planejarGeracao(comConflitos, 'SUBSTITUIR');
    expect(plano).toMatchObject({ pulados: 1, apagarIds: [9] });
    expect(plano.criar).toHaveLength(2);
  });

  it('SUBSTITUIR não apaga plantão que o usuário não pode apagar', () => {
    const plano = planejarGeracao(comConflitos, 'SUBSTITUIR', () => false);
    expect(plano).toMatchObject({ pulados: 2, apagarIds: [] });
  });

  it('sobreposição entre itens gerados é sinalizada', () => {
    const dup = gerarItens({
      funcionarios: [{ id: 1, nome: 'Ana', setorId: 10 }, { id: 1, nome: 'Ana', setorId: 10 }],
      padrao: semanal([1]),
      turno,
      periodoInicio: '2026-10-05',
      periodoFim: '2026-10-05',
    });
    const r = calcularConflitosItens(dup, [], []);
    expect(r[0].conflitos[0]).toMatchObject({ tipo: 'SOBREPOSICAO' });
    expect(r[0].conflitos[0].plantaoId).toBeUndefined();
    expect(planejarGeracao(r, 'SUBSTITUIR').criar).toHaveLength(0);
  });
});
