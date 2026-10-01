/**
 * Normalização de telefones brasileiros (ver docs/05-whatsapp.md).
 *
 * Formato canônico: só dígitos, com DDI 55 → `55` + DDD (2) + número (8 ou 9).
 * Ex.: "(51) 99999-8888" → "5551999998888".
 *
 * O WhatsApp pode identificar celulares com ou sem o 9º dígito, por isso
 * guardamos também a variação (`telefoneAlt`) e procuramos pelas duas.
 */

const DDI = '55';

/** Só os dígitos da string. */
export function apenasDigitos(valor: string): string {
  return (valor ?? '').replace(/\D+/g, '');
}

/** DDD válido: dois dígitos de 1 a 9 (11–99, sem zero). */
function dddValido(ddd: string): boolean {
  return /^[1-9]{2}$/.test(ddd);
}

/**
 * Valida um telefone já normalizado (55 + DDD + 8/9 dígitos).
 * - 9 dígitos: celular, começa com 9.
 * - 8 dígitos: fixo (2–5) ou celular antigo sem o 9º dígito (6–9).
 */
export function telefoneValido(normalizado: string): boolean {
  if (!/^\d+$/.test(normalizado) || !normalizado.startsWith(DDI)) return false;
  const ddd = normalizado.slice(2, 4);
  const numero = normalizado.slice(4);
  if (!dddValido(ddd)) return false;
  if (numero.length === 9) return numero.startsWith('9');
  if (numero.length === 8) return /^[2-9]/.test(numero);
  return false;
}

/**
 * Normaliza qualquer formato digitado/recebido para só dígitos com DDI 55.
 * Aceita: "+55 (51) 99999-8888", "51 99999-8888", "051999998888",
 * "005551999998888", "5551999998888@s.whatsapp.net" etc.
 * @returns o telefone normalizado ou `null` se inválido.
 */
export function normalizarTelefone(valor: string | null | undefined): string | null {
  if (!valor) return null;
  // JID do WhatsApp: "5551999998888@s.whatsapp.net" / "...:12@s.whatsapp.net"
  const semJid = String(valor).split('@')[0].split(':')[0];
  let d = apenasDigitos(semJid);
  // prefixo internacional "00" e zero de discagem de longa distância
  d = d.replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) d = DDI + d;
  if (d.length !== 12 && d.length !== 13) return null;
  return telefoneValido(d) ? d : null;
}

/** DDDs existentes no Brasil (Anatel). */
const DDDS_BR = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/**
 * Normalização ESTRITA para o cadastro de funcionário (o que o RH digita).
 * Além de `normalizarTelefone`, exige DDD existente e número atual:
 * celular com 9 dígitos começando com 9, ou fixo com 8 dígitos (2–5).
 * Celular de 8 dígitos (formato antigo, sem o 9º dígito) é recusado — ele só é
 * aceito na busca de mensagens recebidas (webhook), via `normalizarTelefone`.
 * @returns o telefone normalizado ou `null` se inválido para cadastro.
 */
export function normalizarTelefoneCadastro(valor: string | null | undefined): string | null {
  const n = normalizarTelefone(valor);
  if (!n) return null;
  if (!DDDS_BR.has(Number(n.slice(2, 4)))) return null;
  const numero = n.slice(4);
  if (numero.length === 9) return numero.startsWith('9') ? n : null;
  return /^[2-5]/.test(numero) ? n : null;
}

/**
 * Calcula a variação com/sem o 9º dígito de um celular já normalizado.
 * - "5551999998888" (13) → "555199998888"
 * - "555199998888" (12, celular 6–9) → "5551999998888"
 * - fixo (2–5) ou inválido → `null`
 */
export function variacaoNonoDigito(normalizado: string): string | null {
  if (!telefoneValido(normalizado)) return null;
  const prefixo = normalizado.slice(0, 4);
  const numero = normalizado.slice(4);
  if (numero.length === 9) return prefixo + numero.slice(1);
  if (/^[6-9]/.test(numero)) return prefixo + '9' + numero;
  return null;
}

/**
 * Todas as formas pelas quais o número pode estar gravado/chegar
 * (normalizado + variação do 9º dígito). Use na busca por `telefone` OU `telefoneAlt`.
 * @returns lista vazia se o valor for inválido.
 */
export function variantesTelefone(valor: string | null | undefined): string[] {
  const n = normalizarTelefone(valor);
  if (!n) return [];
  const alt = variacaoNonoDigito(n);
  return alt ? [n, alt] : [n];
}

/** Formata para exibição: "+55 (51) 99999-8888". */
export function formatarTelefone(normalizado: string): string {
  if (!telefoneValido(normalizado)) return normalizado;
  const ddd = normalizado.slice(2, 4);
  const n = normalizado.slice(4);
  const corte = n.length - 4;
  return `+55 (${ddd}) ${n.slice(0, corte)}-${n.slice(corte)}`;
}
