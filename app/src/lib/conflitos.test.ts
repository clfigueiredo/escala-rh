import { describe, expect, it } from 'vitest';
import { calcularConflitos, conflitosAusencia, conflitosSobreposicao, datasDoIntervalo } from './conflitos';

describe('datasDoIntervalo', () => {
  it('turno diurno toca 1 dia', () => {
    expect(datasDoIntervalo(new Date('2026-10-06T10:00:00Z'), new Date('2026-10-06T22:00:00Z'))).toEqual(['2026-10-06']);
  });
  it('turno 19:00–07:00 toca 2 dias (inclusive virada de mês)', () => {
    expect(datasDoIntervalo(new Date('2026-10-31T22:00:00Z'), new Date('2026-11-01T10:00:00Z'))).toEqual(['2026-10-31', '2026-11-01']);
  });
  it('fim exatamente à meia-noite de SP não toca o dia seguinte', () => {
    // 06/10 18:00 → 07/10 00:00 (SP) = 03:00Z
    expect(datasDoIntervalo(new Date('2026-10-06T21:00:00Z'), new Date('2026-10-07T03:00:00Z'))).toEqual(['2026-10-06']);
  });
  it('usa o fuso de SP, não UTC (22:00 SP = 01:00Z do dia seguinte)', () => {
    expect(datasDoIntervalo(new Date('2026-10-07T01:00:00Z'), new Date('2026-10-07T02:00:00Z'))).toEqual(['2026-10-06']);
  });
});

describe('conflitos', () => {
  const alvo = { id: 1, funcionarioId: 3, inicio: new Date('2026-10-06T22:00:00Z'), fim: new Date('2026-10-07T10:00:00Z') };

  it('sobreposição ignora o próprio plantão, outro funcionário e intervalos só encostados', () => {
    const outros = [
      alvo,
      { id: 2, funcionarioId: 3, inicio: new Date('2026-10-07T10:00:00Z'), fim: new Date('2026-10-07T22:00:00Z') }, // encosta
      { id: 3, funcionarioId: 4, inicio: alvo.inicio, fim: alvo.fim }, // outro funcionário
      { id: 4, funcionarioId: 3, inicio: new Date('2026-10-07T09:00:00Z'), fim: new Date('2026-10-07T12:00:00Z') },
    ];
    const r = conflitosSobreposicao(alvo, outros);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ tipo: 'SOBREPOSICAO', plantaoId: 4 });
    expect(r[0].descricao).toBe('Sobrepõe outro plantão (07/10 06:00–09:00)');
  });

  it('ausência no dia seguinte ao início do turno noturno conta', () => {
    const r = conflitosAusencia(alvo, [{ id: 1, funcionarioId: 3, tipo: 'ATESTADO', dataInicio: '2026-10-07', dataFim: '2026-10-07' }]);
    expect(r).toEqual([{ tipo: 'AUSENCIA', descricao: 'Funcionário com atestado em 07/10' }]);
  });

  it('ausência antes/depois ou de outro funcionário não conta', () => {
    const r = calcularConflitos(alvo, [], [
      { id: 1, funcionarioId: 3, tipo: 'FERIAS', dataInicio: '2026-10-01', dataFim: '2026-10-05' },
      { id: 2, funcionarioId: 3, tipo: 'FOLGA', dataInicio: '2026-10-08', dataFim: '2026-10-08' },
      { id: 3, funcionarioId: 9, tipo: 'FOLGA', dataInicio: '2026-10-06', dataFim: '2026-10-06' },
    ]);
    expect(r).toEqual([]);
  });
});
