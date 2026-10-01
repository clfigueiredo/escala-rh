/**
 * Serializers do logger (pino) da API — mascaram segredos antes de ir para o log.
 *
 * - O token do webhook vai na URL (/api/webhooks/evolution/<TOKEN>): o `req` serializer
 *   troca o segmento por `***`.
 * - Erros (ex.: resposta da Evolution ecoando a URL do webhook) passam pelo mesmo
 *   mascaramento no `err` serializer.
 */
import type { FastifyRequest } from 'fastify';
import { env } from '../config/env';

const MASCARA = '***';
/** Tudo após /webhooks/evolution/ até espaço, aspas, `?` ou `#`. */
const RE_WEBHOOK = /(\/webhooks\/evolution\/)[^\s"'?#]+/gi;

function tokenWebhook(): string | undefined {
  try {
    const t = env.WEBHOOK_TOKEN;
    return t && t.length >= 8 ? t : undefined;
  } catch {
    return undefined;
  }
}

/** Remove o token do webhook (no caminho da URL ou literal) de um texto. */
export function mascararSegredos(texto: string): string {
  let t = texto.replace(RE_WEBHOOK, `$1${MASCARA}`);
  const tok = tokenWebhook();
  if (tok && t.includes(tok)) t = t.split(tok).join(MASCARA);
  return t;
}

function mascararValor(v: unknown): unknown {
  if (v === undefined || v === null) return v;
  try {
    return JSON.parse(mascararSegredos(JSON.stringify(v)));
  } catch {
    return '[não serializável]';
  }
}

/** Serializer de request: mesmos campos do padrão do Fastify, com a URL mascarada. */
export function serializarReq(req: FastifyRequest) {
  return {
    method: req.method,
    url: typeof req.url === 'string' ? mascararSegredos(req.url) : req.url,
    host: req.host,
    remoteAddress: req.ip,
    remotePort: req.socket ? req.socket.remotePort : undefined,
  };
}

type ErroSerializado = { [chave: string]: unknown; type: string; message: string; stack: string };

/** Serializer de erro: type/message/stack + propriedades próprias, tudo mascarado. */
export function serializarErro(err: Error): ErroSerializado {
  if (!(err instanceof Error)) {
    return { type: typeof err, message: mascararSegredos(String(err)), stack: '' };
  }
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(err)) extra[k] = v;
  const base: Record<string, unknown> = {
    type: err.constructor?.name ?? err.name,
    message: err.message,
    stack: err.stack ?? '',
    ...extra,
  };
  if (err.cause !== undefined && err.cause !== err) {
    base.cause = err.cause instanceof Error ? serializarErro(err.cause) : err.cause;
  }
  const r = mascararValor(base);
  if (r && typeof r === 'object') return r as ErroSerializado;
  // propriedades não serializáveis (ex.: referência circular): fica só o essencial
  return {
    type: String(base.type),
    message: mascararSegredos(err.message),
    stack: mascararSegredos(err.stack ?? ''),
  };
}

export const serializadoresLog = {
  req: serializarReq,
  err: serializarErro,
};
