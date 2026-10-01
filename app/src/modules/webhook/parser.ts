/**
 * Interpretação do payload de webhook da Evolution API v2.3.7.
 *
 * Formato real (webhook.controller.ts da v2.3.7):
 * ```json
 * { "event": "messages.upsert", "instance": "escala", "data": { ... }, "destination": "...",
 *   "date_time": "...", "sender": "5551...@s.whatsapp.net", "server_url": "...", "apikey": null }
 * ```
 * `event` vem em minúsculas com ponto ("messages.upsert", "connection.update", "qrcode.updated").
 *
 * `data` de messages.upsert (prepareMessage):
 * ```json
 * { "key": { "remoteJid": "5551999998888@s.whatsapp.net", "fromMe": false, "id": "3EB0...",
 *            "remoteJidAlt"?: "...", "addressingMode"?: "lid" | "pn", "participant"?: "..." },
 *   "pushName": "Maria", "message": { "conversation": "1" }, "messageType": "conversation",
 *   "messageTimestamp": 1759200000, "instanceId": "...", "source": "android" }
 * ```
 * - extendedTextMessage já é convertido pela Evolution para `message.conversation`
 *   (mesmo assim tratamos `extendedTextMessage.text`).
 * - LID: se `remoteJid` é `...@lid` e há `remoteJidAlt`, a v2.3.7 já troca antes de enviar.
 *   Tratamos também `remoteJidAlt` / `senderPn` caso ainda chegue `@lid`.
 */
import { normalizarTelefone } from '../../lib/telefone';

export type EventoWebhook = 'MESSAGES_UPSERT' | 'CONNECTION_UPDATE' | 'QRCODE_UPDATED' | 'OUTRO';

/** "messages.upsert" / "MESSAGES_UPSERT" → "MESSAGES_UPSERT". */
export function normalizarEvento(evento: unknown): EventoWebhook {
  if (typeof evento !== 'string') return 'OUTRO';
  const e = evento.replace(/[.-]/g, '_').toUpperCase();
  return e === 'MESSAGES_UPSERT' || e === 'CONNECTION_UPDATE' || e === 'QRCODE_UPDATED' ? e : 'OUTRO';
}

export type MensagemExtraida =
  | { tipo: 'texto'; telefone: string; texto: string; msgId: string | null; timestamp: number | null }
  | { tipo: 'ignorar'; motivo: string };

interface ChaveMsg {
  remoteJid?: string;
  remoteJidAlt?: string;
  senderPn?: string;
  fromMe?: boolean;
  id?: string;
}

interface DadosMsg {
  key?: ChaveMsg;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
  } | null;
  messageTimestamp?: number | string;
}

function ehJidPessoa(jid: string | undefined): boolean {
  return !!jid && /@(s\.whatsapp\.net|c\.us)$/.test(jid);
}

/** Extrai remetente e texto de um item `data` de messages.upsert. */
export function extrairMensagem(dados: unknown): MensagemExtraida {
  if (!dados || typeof dados !== 'object') return { tipo: 'ignorar', motivo: 'payload sem data' };
  const d = dados as DadosMsg;
  const key = d.key;
  if (!key || typeof key.remoteJid !== 'string') return { tipo: 'ignorar', motivo: 'sem remoteJid' };
  if (key.fromMe) return { tipo: 'ignorar', motivo: 'fromMe' };

  const jid = key.remoteJid;
  if (jid.endsWith('@g.us')) return { tipo: 'ignorar', motivo: 'grupo' };
  if (jid === 'status@broadcast' || jid.endsWith('@broadcast')) return { tipo: 'ignorar', motivo: 'status/broadcast' };
  if (jid.endsWith('@newsletter')) return { tipo: 'ignorar', motivo: 'canal' };

  const texto = d.message?.conversation ?? d.message?.extendedTextMessage?.text;
  if (typeof texto !== 'string' || !texto.trim()) return { tipo: 'ignorar', motivo: 'sem texto' };

  // Remetente: JID de telefone; se vier @lid, tenta os campos alternativos.
  let jidTelefone: string | undefined;
  if (ehJidPessoa(jid)) jidTelefone = jid;
  else if (jid.endsWith('@lid')) {
    jidTelefone = [key.remoteJidAlt, key.senderPn].find((j) => ehJidPessoa(j));
    if (!jidTelefone) return { tipo: 'ignorar', motivo: 'remetente @lid sem número alternativo' };
  } else {
    return { tipo: 'ignorar', motivo: `JID não suportado: ${jid}` };
  }

  const telefone = normalizarTelefone(jidTelefone);
  if (!telefone) return { tipo: 'ignorar', motivo: 'telefone não reconhecido (fora do Brasil?)' };

  const ts = Number(d.messageTimestamp);
  return {
    tipo: 'texto',
    telefone,
    texto: texto.trim(),
    msgId: typeof key.id === 'string' ? key.id : null,
    timestamp: Number.isFinite(ts) && ts > 0 ? ts : null,
  };
}
