/**
 * Cliente HTTP da Evolution API v2 (validado contra evoapicloud/evolution-api:v2.3.7).
 *
 * Só é acessível na rede interna do Docker (regra 1 do CLAUDE.md). Autenticação
 * pelo header `apikey` (chave global do .env). Formatos reais (v2.3.7):
 *
 * - POST   /instance/create                → 201 { instance: { instanceName, status }, hash, qrcode: { code, base64 } }
 * - GET    /instance/connect/{inst}        → 200 { pairingCode, code, base64, count }   (ou { instance: { state } } se já conectado)
 * - GET    /instance/connectionState/{inst}→ 200 { instance: { instanceName, state: open|connecting|close } }
 * - GET    /instance/fetchInstances?instanceName= → 200 [{ name, connectionStatus, ownerJid, profileName, ... }]
 * - DELETE /instance/logout/{inst}         → 200 { status: 'SUCCESS' } | 400 "... is not connected"
 * - POST   /webhook/set/{inst}             → 201 { url, enabled, events, webhookByEvents, webhookBase64 }
 * - POST   /message/sendText/{inst}        → 201 { key: { id, remoteJid, fromMe }, ... }
 *     número sem WhatsApp → 400 { response: { message: [{ exists: false, jid, number }] } }
 *     instância fechada   → 500 "Connection Closed" / 400 "... is not connected"
 * - Instância inexistente → 404 { response: { message: ['The "x" instance does not exist'] } }
 */
import { env } from '../config/env';
import { mascararSegredos } from './log';

export type TipoErroEvolution =
  | 'INSTANCIA_INEXISTENTE'
  | 'NAO_CONECTADO'
  | 'NUMERO_INVALIDO'
  | 'TIMEOUT'
  | 'REDE'
  | 'HTTP';

/** Erro tipado da Evolution API (mensagem em pt-BR, pronta para log/painel). */
export class EvolutionErro extends Error {
  constructor(
    public readonly tipo: TipoErroEvolution,
    message: string,
    public readonly status?: number,
    public readonly detalhes?: unknown,
  ) {
    super(message);
    this.name = 'EvolutionErro';
  }
}

export type EstadoConexao = 'open' | 'connecting' | 'close';

export const EVENTOS_WEBHOOK = ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'] as const;

const TIMEOUT_PADRAO_MS = 15_000;

function instancia(): string {
  return encodeURIComponent(env.EVOLUTION_INSTANCE);
}

/** Extrai o texto de erro do corpo da Evolution (`response.message` pode ser string ou array). */
function mensagemDoCorpo(corpo: unknown): string {
  if (!corpo || typeof corpo !== 'object') return typeof corpo === 'string' ? corpo : '';
  const c = corpo as { response?: { message?: unknown }; message?: unknown; error?: unknown };
  const m = c.response?.message ?? c.message ?? c.error;
  if (Array.isArray(m)) return m.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('; ');
  if (typeof m === 'string') return m;
  return m ? JSON.stringify(m) : '';
}

function numeroInexistente(corpo: unknown): boolean {
  const m = (corpo as { response?: { message?: unknown } })?.response?.message;
  return Array.isArray(m) && m.some((x) => x && typeof x === 'object' && (x as { exists?: boolean }).exists === false);
}

async function requisicao<T>(
  metodo: 'GET' | 'POST' | 'DELETE',
  caminho: string,
  corpo?: unknown,
  timeoutMs = TIMEOUT_PADRAO_MS,
): Promise<T> {
  const url = `${env.EVOLUTION_URL.replace(/\/+$/, '')}${caminho}`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: metodo,
      headers: {
        apikey: env.EVOLUTION_API_KEY,
        ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const e = err as Error;
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      throw new EvolutionErro('TIMEOUT', `Evolution API não respondeu em ${Math.round(timeoutMs / 1000)} s`);
    }
    throw new EvolutionErro('REDE', `Não foi possível conectar à Evolution API (${e.message})`);
  }

  const texto = await resp.text();
  let dados: unknown = texto;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    /* corpo não-JSON */
  }

  if (resp.ok) return dados as T;

  // a resposta pode ecoar a URL do webhook (com o token): nunca repassar para log/painel
  const msg = mascararSegredos(mensagemDoCorpo(dados));
  if (resp.status === 404 && /instance/i.test(msg) && /(does not exist|not found)/i.test(msg)) {
    throw new EvolutionErro('INSTANCIA_INEXISTENTE', `Instância "${env.EVOLUTION_INSTANCE}" não existe na Evolution API`, 404);
  }
  if (numeroInexistente(dados)) {
    throw new EvolutionErro('NUMERO_INVALIDO', 'Número não possui WhatsApp', resp.status, dados);
  }
  if (/not connected|connection closed|closed connection/i.test(msg)) {
    throw new EvolutionErro('NAO_CONECTADO', 'WhatsApp desconectado: conecte o número na tela Conexão', resp.status);
  }
  throw new EvolutionErro('HTTP', `Evolution API respondeu ${resp.status}${msg ? `: ${msg}` : ''}`, resp.status, dados);
}

/** Cria a instância (Baileys) já pedindo QR Code. Retorna o QR (data URL) se veio na resposta. */
export async function criarInstancia(): Promise<{ qrcode?: string }> {
  const r = await requisicao<{ qrcode?: { base64?: string } }>(
    'POST',
    '/instance/create',
    { instanceName: env.EVOLUTION_INSTANCE, integration: 'WHATSAPP-BAILEYS', qrcode: true },
    30_000,
  );
  return { qrcode: r?.qrcode?.base64 || undefined };
}

/** Inicia/retoma a conexão e devolve o QR Code (data URL) — ou o estado, se já conectado. */
export async function conectar(): Promise<{ qrcode?: string; estado?: string }> {
  const r = await requisicao<{ base64?: string; instance?: { state?: string } }>(
    'GET',
    `/instance/connect/${instancia()}`,
    undefined,
    30_000,
  );
  return { qrcode: r?.base64 || undefined, estado: r?.instance?.state };
}

/** Estado da conexão. Lança INSTANCIA_INEXISTENTE se a instância não foi criada. */
export async function estadoConexao(timeoutMs = 8_000): Promise<EstadoConexao> {
  const r = await requisicao<{ instance?: { state?: string } }>(
    'GET',
    `/instance/connectionState/${instancia()}`,
    undefined,
    timeoutMs,
  );
  const s = r?.instance?.state;
  if (s === 'open' || s === 'connecting') return s;
  return 'close';
}

/** Dados da instância (número conectado em `ownerJid`). `null` se não existir. */
export async function buscarInstancia(): Promise<{ ownerJid: string | null; profileName: string | null } | null> {
  try {
    const r = await requisicao<Array<{ name?: string; ownerJid?: string | null; profileName?: string | null }>>(
      'GET',
      `/instance/fetchInstances?instanceName=${instancia()}`,
      undefined,
      8_000,
    );
    const i = Array.isArray(r) ? r.find((x) => x.name === env.EVOLUTION_INSTANCE) ?? r[0] : undefined;
    return i ? { ownerJid: i.ownerJid ?? null, profileName: i.profileName ?? null } : null;
  } catch (err) {
    if (err instanceof EvolutionErro && (err.tipo === 'INSTANCIA_INEXISTENTE' || err.status === 404)) return null;
    throw err;
  }
}

/** Desconecta (logout) o número. Não falha se já estiver desconectado ou se a instância não existir. */
export async function desconectar(): Promise<void> {
  try {
    await requisicao('DELETE', `/instance/logout/${instancia()}`, undefined, 20_000);
  } catch (err) {
    if (err instanceof EvolutionErro && (err.tipo === 'NAO_CONECTADO' || err.tipo === 'INSTANCIA_INEXISTENTE')) return;
    throw err;
  }
}

/** URL interna do webhook (rede Docker). */
export function urlWebhook(): string {
  return `http://app:3000/api/webhooks/evolution/${env.WEBHOOK_TOKEN}`;
}

/** (Re)configura o webhook da instância. */
export async function configurarWebhook(): Promise<void> {
  await requisicao('POST', `/webhook/set/${instancia()}`, {
    webhook: {
      enabled: true,
      url: urlWebhook(),
      byEvents: false,
      base64: false,
      events: [...EVENTOS_WEBHOOK],
    },
  });
}

/**
 * Envia texto. `numero` = telefone normalizado (só dígitos, com 55) — a Evolution
 * resolve o JID (com/sem 9º dígito). Retorna o id da mensagem no WhatsApp.
 */
export async function enviarTexto(numero: string, texto: string): Promise<{ id: string | null }> {
  const r = await requisicao<{ key?: { id?: string } }>(
    'POST',
    `/message/sendText/${instancia()}`,
    { number: numero, text: texto },
    30_000,
  );
  return { id: r?.key?.id ?? null };
}

/** Mensagem amigável para qualquer erro vindo do cliente. */
export function descreverErro(err: unknown): string {
  if (err instanceof EvolutionErro) return err.message;
  if (err instanceof Error) return err.message;
  return String(err);
}
