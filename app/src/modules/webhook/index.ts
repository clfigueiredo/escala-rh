/**
 * POST /api/webhooks/evolution/:token — chamado pela Evolution API na rede interna.
 *
 * - Sem sessão; autenticado pelo token na URL (comparação em tempo constante), num hook
 *   `onRequest` (antes do parse do corpo). Errado → 404. Corpo limitado a 1 MB.
 * - O token nunca vai para o log: o serializer de `req` (lib/log.ts) mascara a URL.
 * - Responde 200 na hora e processa em segundo plano (a Evolution reenvia em erro/timeout).
 * - MESSAGES_UPSERT → bot (lib/bot.ts). CONNECTION_UPDATE/QRCODE_UPDATED → só log.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyBaseLogger, FastifyPluginAsync } from 'fastify';
import { env } from '../../config/env';
import { processarMensagemRecebida, type DependenciasBot } from '../../lib/bot';
import { extrairMensagem, normalizarEvento } from './parser';

/** Mensagens mais antigas que isso (ex.: sincronização após reconectar) não recebem resposta. */
export const IDADE_MAXIMA_MENSAGEM_S = 10 * 60;

function digest(v: string): Buffer {
  return createHash('sha256').update(v).digest();
}

/** Compara tokens em tempo constante (independe do tamanho, via hash). */
export function tokenValido(recebido: string | undefined): boolean {
  if (!recebido) return false;
  return timingSafeEqual(digest(recebido), digest(env.WEBHOOK_TOKEN));
}

// Processamentos em andamento (permite aos testes aguardar).
const pendentes = new Set<Promise<void>>();
export async function aguardarProcessamentos(): Promise<void> {
  while (pendentes.size) await Promise.allSettled([...pendentes]);
}

let depsBot: DependenciasBot | undefined;
/** Só para testes: injeta envio/relógio do bot. */
export function definirDependenciasBot(d: DependenciasBot | undefined): void {
  depsBot = d;
}

export async function tratarEvento(corpo: Record<string, unknown>, log: FastifyBaseLogger): Promise<void> {
  const evento = normalizarEvento(corpo.event);
  if (evento === 'CONNECTION_UPDATE') {
    const d = (corpo.data ?? {}) as { state?: string; statusReason?: number };
    log.info({ instancia: corpo.instance, estado: d.state, motivo: d.statusReason }, 'WhatsApp: connection.update');
    return;
  }
  if (evento === 'QRCODE_UPDATED') {
    log.debug({ instancia: corpo.instance }, 'WhatsApp: qrcode.updated');
    return;
  }
  if (evento !== 'MESSAGES_UPSERT') return;

  const itens = Array.isArray(corpo.data) ? corpo.data : [corpo.data];
  for (const item of itens) {
    const m = extrairMensagem(item);
    if (m.tipo === 'ignorar') {
      log.debug({ motivo: m.motivo }, 'webhook: mensagem ignorada');
      continue;
    }
    if (m.timestamp && Date.now() / 1000 - m.timestamp > IDADE_MAXIMA_MENSAGEM_S) {
      log.info({ msgId: m.msgId }, 'webhook: mensagem antiga ignorada (sincronização)');
      continue;
    }
    const r = await processarMensagemRecebida(
      { telefone: m.telefone, texto: m.texto, msgId: m.msgId },
      ...(depsBot ? [depsBot] : []),
    );
    log.info({ telefone: m.telefone, resultado: r.acao }, 'bot: mensagem processada');
  }
}

/** Limite do corpo do webhook (eventos de texto são pequenos; mídia vem sem base64). */
export const LIMITE_CORPO_WEBHOOK = 1024 * 1024;

const plugin: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { token: string } }>(
    '/:token',
    {
      bodyLimit: LIMITE_CORPO_WEBHOOK,
      // Token validado ANTES do parse do corpo: token errado → 404 mesmo com JSON inválido/grande.
      onRequest: async (request, reply) => {
        if (!tokenValido(request.params.token)) {
          return reply.code(404).send({ erro: 'Não encontrado' });
        }
      },
    },
    async (request, reply) => {
      const corpo = request.body;
      if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
        return reply.code(400).send({ erro: 'Payload inválido' });
      }
      const p = tratarEvento(corpo as Record<string, unknown>, request.log)
        .catch((err) => request.log.error({ err }, 'webhook: erro ao processar evento'))
        .finally(() => pendentes.delete(p));
      pendentes.add(p);
      return reply.code(200).send({ ok: true });
    },
  );
};

export default plugin;
