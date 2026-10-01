import { describe, expect, it } from 'vitest';
import { dadosExemplo, renderizarTemplate } from './template';

describe('renderizarTemplate', () => {
  const dados = {
    nome: 'João',
    // 06/10/2026 (terça) 19:00 SP → 07/10 07:00 SP (vira a noite)
    inicio: new Date('2026-10-06T22:00:00.000Z'),
    fim: new Date('2026-10-07T10:00:00.000Z'),
    turno: 'Noturno',
    setor: 'UTI',
  };

  it('substitui todas as variáveis no fuso de SP (processo roda em UTC)', () => {
    const t = '{nome}|{data}|{dia_semana}|{inicio}|{fim}|{turno}|{setor}';
    expect(renderizarTemplate(t, dados)).toBe('João|06/10|terça-feira|19:00|07:00|Noturno|UTI');
  });

  it('variável repetida e desconhecida', () => {
    expect(renderizarTemplate('{nome} {nome} {xyz}', dados)).toBe('João João {xyz}');
  });

  it('turno avulso', () => {
    expect(renderizarTemplate('{turno}', { ...dados, turno: null })).toBe('Horário avulso');
  });

  it('template padrão com emoji e quebras de linha', () => {
    const t = 'Olá {nome}! 👋\nLembrete: seu turno começa hoje às {inicio} (até {fim}) no setor {setor}.\nBom trabalho!';
    expect(renderizarTemplate(t, dados)).toBe(
      'Olá João! 👋\nLembrete: seu turno começa hoje às 19:00 (até 07:00) no setor UTI.\nBom trabalho!',
    );
  });

  it('dados de exemplo: amanhã 07:00–19:00', () => {
    const d = dadosExemplo('2026-12-31');
    expect(renderizarTemplate('{data} {dia_semana} {inicio}-{fim}', d)).toBe('01/01 sexta-feira 07:00-19:00');
  });
});
