import { describe, expect, it } from 'vitest';
import {
  formatarTelefone,
  normalizarTelefone,
  normalizarTelefoneCadastro,
  telefoneValido,
  variacaoNonoDigito,
  variantesTelefone,
} from './telefone';

describe('normalizarTelefone', () => {
  it.each([
    ['(51) 99999-8888', '5551999998888'],
    ['+55 (51) 99999-8888', '5551999998888'],
    ['51999998888', '5551999998888'],
    ['5551999998888', '5551999998888'],
    ['051999998888', '5551999998888'],
    ['005551999998888', '5551999998888'],
    ['51 9999-8888', '555199998888'],
    ['(51) 3222-1111', '555132221111'],
    ['5551999998888@s.whatsapp.net', '5551999998888'],
    ['555199998888@s.whatsapp.net', '555199998888'],
    ['5551999998888:12@s.whatsapp.net', '5551999998888'],
    ['55 999998888', '5555999998888'], // DDD 55
  ])('%s → %s', (entrada, esperado) => {
    expect(normalizarTelefone(entrada)).toBe(esperado);
  });

  it.each(['', '123', '9999-8888', '(10) 99999-8888', '(51) 89999-8888', '5551199998888', '1551999998888', 'abc', '555112345678901'])(
    'rejeita %s',
    (entrada) => {
      expect(normalizarTelefone(entrada)).toBeNull();
    },
  );

  it('rejeita null/undefined', () => {
    expect(normalizarTelefone(null)).toBeNull();
    expect(normalizarTelefone(undefined)).toBeNull();
  });
});

describe('variacaoNonoDigito', () => {
  it('remove o 9 de celular com 9 dígitos', () => {
    expect(variacaoNonoDigito('5551999998888')).toBe('555199998888');
  });
  it('insere o 9 em celular com 8 dígitos', () => {
    expect(variacaoNonoDigito('555199998888')).toBe('5551999998888');
    expect(variacaoNonoDigito('555188887777')).toBe('5551988887777');
  });
  it('fixo não tem variação', () => {
    expect(variacaoNonoDigito('555132221111')).toBeNull();
  });
  it('inválido → null', () => {
    expect(variacaoNonoDigito('123')).toBeNull();
  });
});

describe('variantesTelefone', () => {
  it('retorna as duas formas de celular', () => {
    expect(variantesTelefone('(51) 99999-8888')).toEqual(['5551999998888', '555199998888']);
    expect(variantesTelefone('555199998888@s.whatsapp.net')).toEqual(['555199998888', '5551999998888']);
  });
  it('fixo só uma forma', () => {
    expect(variantesTelefone('5132221111')).toEqual(['555132221111']);
  });
  it('inválido → vazio', () => {
    expect(variantesTelefone('xyz')).toEqual([]);
  });
});

describe('telefoneValido / formatarTelefone', () => {
  it('valida', () => {
    expect(telefoneValido('5551999998888')).toBe(true);
    expect(telefoneValido('51999998888')).toBe(false);
  });
  it('formata', () => {
    expect(formatarTelefone('5551999998888')).toBe('+55 (51) 99999-8888');
    expect(formatarTelefone('555132221111')).toBe('+55 (51) 3222-1111');
  });
});

describe('normalizarTelefoneCadastro', () => {
  it('aceita celular com DDD 55 (igual ao DDI) em vários formatos', () => {
    for (const v of ['(55) 99949-3554', '55999493554', '55 99949 3554', '+55 55 99949-3554', '5555999493554', '055 99949-3554']) {
      expect(normalizarTelefoneCadastro(v)).toBe('5555999493554');
    }
  });
  it('aceita celular e fixo de outros DDDs', () => {
    expect(normalizarTelefoneCadastro('(51) 99999-8888')).toBe('5551999998888');
    expect(normalizarTelefoneCadastro('(51) 3333-4444')).toBe('555133334444');
  });
  it('recusa celular de 8 dígitos (sem o 9º dígito)', () => {
    expect(normalizarTelefoneCadastro('9994935554')).toBeNull(); // virava DDD 99 + 9493-5554
    expect(normalizarTelefoneCadastro('(55) 9949-3554')).toBeNull();
    expect(normalizarTelefoneCadastro('555599493554')).toBeNull();
  });
  it('recusa DDD inexistente e número incompleto', () => {
    expect(normalizarTelefoneCadastro('(20) 99999-8888')).toBeNull();
    expect(normalizarTelefoneCadastro('(55) 99949-355')).toBeNull();
    expect(normalizarTelefoneCadastro('99949-3554')).toBeNull();
  });
});
