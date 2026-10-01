import type {
  DirecaoMensagem,
  EstadoWhatsApp,
  OrigemMensagem,
  StatusMensagem,
  StatusPlantao,
  TipoAusencia,
  TipoConflito,
  TipoRegra,
} from '../api/types';

export const ROTULO_AUSENCIA: Record<TipoAusencia, string> = {
  FERIAS: 'Férias',
  ATESTADO: 'Atestado',
  FOLGA: 'Folga',
  OUTRO: 'Outro',
};

export const ROTULO_STATUS_PLANTAO: Record<StatusPlantao, string> = {
  AGENDADO: 'Agendado',
  CANCELADO: 'Cancelado',
};

export const ROTULO_CONFLITO: Record<TipoConflito, string> = {
  SOBREPOSICAO: 'Sobreposição',
  AUSENCIA: 'Ausência',
};

export const ROTULO_REGRA: Record<TipoRegra, string> = {
  ANTECEDENCIA: 'Antecedência',
  VESPERA: 'Véspera',
};

export const ROTULO_DIRECAO: Record<DirecaoMensagem, string> = {
  ENVIADA: 'Enviada',
  RECEBIDA: 'Recebida',
};

export const ROTULO_ORIGEM: Record<OrigemMensagem, string> = {
  LEMBRETE: 'Lembrete',
  BOT: 'Bot',
  MANUAL: 'Manual',
};

export const ROTULO_STATUS_MSG: Record<StatusMensagem, string> = {
  OK: 'OK',
  FALHOU: 'Falhou',
};

export const ROTULO_ESTADO_WPP: Record<EstadoWhatsApp, string> = {
  open: 'Conectado',
  connecting: 'Conectando…',
  close: 'Desconectado',
  inexistente: 'Não configurado',
  erro: 'Erro',
};

/** Formata telefone normalizado (5551999998888) para exibição: +55 (51) 99999-8888 */
export function fmtTelefone(tel: string | null | undefined): string {
  if (!tel) return '—';
  let d = tel.replace(/\D/g, '');
  // Celular sem o 9º dígito (ex.: número da conexão vindo do WhatsApp): exibe com o 9.
  if (d.startsWith('55') && d.length === 12 && /[6-9]/.test(d[4])) d = `${d.slice(0, 4)}9${d.slice(4)}`;
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const num = d.slice(4);
    const meio = num.length === 9 ? 5 : 4;
    return `+55 (${ddd}) ${num.slice(0, meio)}-${num.slice(meio)}`;
  }
  return tel;
}

/**
 * Máscara do campo de telefone: "(DD) 9XXXX-XXXX" (celular) ou "(DD) XXXX-XXXX" (fixo).
 * Aceita colar com +55 na frente (o DDI é removido) e limita a DDD + 9 dígitos.
 */
export function mascaraTelefone(valor: string): string {
  let d = valor.replace(/\D/g, '');
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  d = d.slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const n = d.slice(2);
  if (n.length <= 4) return `(${ddd}) ${n}`;
  const meio = n.length === 9 ? 5 : 4;
  return `(${ddd}) ${n.slice(0, meio)}-${n.slice(meio)}`;
}

/**
 * Valida o que foi digitado na máscara (DDD + número, sem o 55).
 * @returns mensagem de erro ou `null` se válido.
 */
export function validarTelefoneDigitado(mascarado: string): string | null {
  const d = mascarado.replace(/\D/g, '');
  if (d.length < 10) return 'Número incompleto: informe DDD + número.';
  if (d[0] === '0' || d[1] === '0') return 'DDD inválido.';
  const n = d.slice(2);
  if (n.length === 9) return n.startsWith('9') ? null : 'Celular deve começar com 9.';
  if (/^[6-9]/.test(n)) return 'Celular precisa ter 9 dígitos (com o 9 na frente).';
  return null;
}

export function fmtMinutos(min: number | null | undefined): string {
  if (min == null) return '—';
  if (min % 1440 === 0) {
    const d = min / 1440;
    return `${d} dia${d > 1 ? 's' : ''} antes`;
  }
  if (min % 60 === 0) {
    const h = min / 60;
    return `${h} hora${h > 1 ? 's' : ''} antes`;
  }
  return `${min} min antes`;
}
