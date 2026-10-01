/**
 * /api/whatsapp — conexão do número com a Evolution API (docs/08-api.md › Conexão).
 * - GET  /status      (todos logados) → { estado, numero?, erro? }
 * - POST /conectar    (ADMIN) → cria instância se preciso, (re)configura webhook, → { estado, qrcode? }
 * - POST /desconectar (ADMIN) → 204
 */
import type { FastifyPluginAsync } from 'fastify';
import { requireAdmin, requireAuth } from '../../auth/guards';
import { HttpError } from '../../lib/erros';
import {
  EvolutionErro,
  buscarInstancia,
  conectar,
  configurarWebhook,
  criarInstancia,
  desconectar,
  estadoConexao,
} from '../../lib/evolution';
import { apenasDigitos } from '../../lib/telefone';

export type EstadoWhatsApp = 'open' | 'connecting' | 'close' | 'inexistente' | 'erro';

export interface StatusWhatsApp {
  estado: EstadoWhatsApp;
  numero?: string;
  erro?: string;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function erroHttp(err: unknown): HttpError {
  if (err instanceof EvolutionErro) {
    return new HttpError(502, `Falha na comunicação com o WhatsApp (Evolution API): ${err.message}`);
  }
  return new HttpError(502, 'Falha na comunicação com o WhatsApp (Evolution API)');
}

export async function obterStatus(): Promise<StatusWhatsApp> {
  let estado: EstadoWhatsApp;
  try {
    estado = await estadoConexao();
  } catch (err) {
    if (err instanceof EvolutionErro && err.tipo === 'INSTANCIA_INEXISTENTE') return { estado: 'inexistente' };
    return { estado: 'erro', erro: err instanceof Error ? err.message : String(err) };
  }
  if (estado !== 'open') return { estado };
  try {
    const inst = await buscarInstancia();
    const numero = inst?.ownerJid ? apenasDigitos(inst.ownerJid.split('@')[0].split(':')[0]) : '';
    return numero ? { estado, numero } : { estado };
  } catch {
    return { estado };
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get('/status', async () => obterStatus());

  app.post('/conectar', { onRequest: [requireAdmin] }, async (request) => {
    try {
      let estado: EstadoWhatsApp;
      let qrcode: string | undefined;
      try {
        estado = await estadoConexao();
      } catch (err) {
        if (!(err instanceof EvolutionErro && err.tipo === 'INSTANCIA_INEXISTENTE')) throw err;
        request.log.info('WhatsApp: criando instância na Evolution API');
        qrcode = (await criarInstancia()).qrcode;
        estado = 'connecting';
      }

      // Sempre (re)configura o webhook — garante URL/token/eventos atualizados.
      await configurarWebhook();

      if (estado === 'open') return { estado };

      if (!qrcode) {
        for (let tentativa = 0; tentativa < 3 && !qrcode; tentativa++) {
          if (tentativa > 0) await esperar(1500);
          const r = await conectar();
          qrcode = r.qrcode;
          if (r.estado === 'open') return { estado: 'open' as const };
        }
      }
      return qrcode ? { estado: 'connecting' as const, qrcode } : { estado: await estadoConexao() };
    } catch (err) {
      request.log.error({ err }, 'WhatsApp: falha ao conectar');
      throw erroHttp(err);
    }
  });

  app.post('/desconectar', { onRequest: [requireAdmin] }, async (request, reply) => {
    try {
      await desconectar();
    } catch (err) {
      request.log.error({ err }, 'WhatsApp: falha ao desconectar');
      throw erroHttp(err);
    }
    return reply.code(204).send();
  });
};

export default plugin;
