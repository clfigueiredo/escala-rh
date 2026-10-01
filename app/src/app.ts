/**
 * Monta a instância Fastify (sem escutar porta) — usada pelo server.ts e por testes (`app.inject`).
 */
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import './auth/tipos';
import { authRotas } from './auth/rotas';
import { COOKIE_SESSAO } from './auth/sessao';
import { env } from './config/env';
import { HttpError } from './lib/erros';
import { serializadoresLog } from './lib/log';
import { confiarProxy } from './lib/proxy';
import { registrarTratadorErros } from './lib/tratador-erros';
import ausencias from './modules/ausencias';
import configuracoes from './modules/configuracoes';
import escala from './modules/escala';
import funcionarios from './modules/funcionarios';
import mensagens from './modules/mensagens';
import padroes from './modules/padroes';
import regrasLembrete from './modules/regras-lembrete';
import setores from './modules/setores';
import turnos from './modules/turnos';
import usuarios from './modules/usuarios';
import webhook from './modules/webhook';
import whatsapp from './modules/whatsapp';

export async function criarApp(
  opcoes: { logger?: boolean; /** só testes: destino do log (padrão stdout) */ logStream?: NodeJS.WritableStream } = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    // Um salto: só o Caddy (rede interna) — ver lib/proxy.ts
    trustProxy: confiarProxy,
    logger:
      opcoes.logger === false
        ? false
        : {
            level: env.NODE_ENV === 'production' ? 'info' : 'debug',
            redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers.apikey'],
            // mascara o token do webhook na URL e em erros
            serializers: serializadoresLog,
            ...(opcoes.logStream ? { stream: opcoes.logStream } : {}),
          },
  });

  app.decorateRequest('usuario', null as never);

  await app.register(cookie);
  await app.register(jwt, {
    secret: env.JWT_SECRET,
    cookie: { cookieName: COOKIE_SESSAO, signed: false },
  });
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: (_req, ctx) =>
      new HttpError(429, `Muitas tentativas. Tente novamente em ${Math.ceil(ctx.ttl / 1000)} s.`),
  });

  registrarTratadorErros(app);

  app.get('/api/health', async () => ({ ok: true }));

  await app.register(authRotas, { prefix: '/api/auth' });

  // Fase 2 — cadastros
  await app.register(usuarios, { prefix: '/api/usuarios' });
  await app.register(setores, { prefix: '/api/setores' });
  await app.register(funcionarios, { prefix: '/api/funcionarios' });
  await app.register(turnos, { prefix: '/api/turnos' });

  // Onda 2 — agente ESCALA
  await app.register(padroes, { prefix: '/api/padroes' });
  await app.register(escala, { prefix: '/api/escala' });
  await app.register(ausencias, { prefix: '/api/ausencias' });

  // Onda 2 — agente WHATSAPP
  await app.register(configuracoes, { prefix: '/api/configuracoes' });
  await app.register(regrasLembrete, { prefix: '/api/regras-lembrete' });
  await app.register(whatsapp, { prefix: '/api/whatsapp' });
  await app.register(mensagens, { prefix: '/api/mensagens' });
  await app.register(webhook, { prefix: '/api/webhooks/evolution' });

  return app;
}
