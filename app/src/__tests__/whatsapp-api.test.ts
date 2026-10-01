/**
 * Rotas do agente WHATSAPP com `app.inject`, Prisma mockado e fetch (Evolution) mockado.
 */
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  usuario: { findUnique: vi.fn(), update: vi.fn() },
  configuracao: { findMany: vi.fn(), upsert: vi.fn() },
  regraLembrete: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  mensagem: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  funcionario: { findMany: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
}));
vi.mock('../lib/prisma', () => ({ prisma: db }));

import { criarApp } from '../app';
import { aguardarProcessamentos, definirDependenciasBot } from '../modules/webhook';

const senhaHash = bcrypt.hashSync('senha-certa-123', 4);
const admin = { id: 1, nome: 'Admin', email: 'admin@x.com', perfil: 'ADMIN', ativo: true, sessaoVersao: 0, senhaHash, setores: [] };
const gestor = { id: 2, nome: 'Gestor', email: 'gestor@x.com', perfil: 'GESTOR', ativo: true, sessaoVersao: 0, senhaHash, setores: [{ setorId: 10 }] };

let app: FastifyInstance;
let cookieAdmin: string;
let cookieGestor: string;
let ipSeq = 0;

async function login(email: string): Promise<string> {
  const r = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    remoteAddress: `10.9.0.${++ipSeq}`,
    payload: { email, senha: 'senha-certa-123' },
  });
  expect(r.statusCode).toBe(200);
  return `sessao=${r.cookies.find((c) => c.name === 'sessao')!.value}`;
}

function respostaJson(status: number, corpo: unknown) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });
}

const fetchMock = vi.fn<typeof fetch>();

beforeAll(async () => {
  vi.stubGlobal('fetch', fetchMock);
  db.usuario.findUnique.mockImplementation((a: { where: { email?: string; id?: number } }) =>
    Promise.resolve([admin, gestor].find((u) => u.email === a.where.email || u.id === a.where.id) ?? null),
  );
  app = await criarApp({ logger: false });
  await app.ready();
  cookieAdmin = await login('admin@x.com');
  cookieGestor = await login('gestor@x.com');
});
afterAll(async () => {
  vi.unstubAllGlobals();
  await app.close();
});
beforeEach(() => {
  fetchMock.mockReset();
  db.configuracao.findMany.mockResolvedValue([]);
});

describe('webhook /api/webhooks/evolution/:token', () => {
  const payload = {
    event: 'messages.upsert',
    instance: 'escala',
    data: {
      key: { remoteJid: '5511988887777@s.whatsapp.net', fromMe: false, id: 'WH-1' },
      message: { conversation: '1' },
      messageType: 'conversation',
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  };

  it('token errado → 404 (sem processar)', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/webhooks/evolution/token-errado', payload });
    expect(r.statusCode).toBe(404);
    expect(db.mensagem.create).not.toHaveBeenCalled();
  });

  it('token com prefixo certo mas tamanho diferente → 404', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/webhooks/evolution/token-de-teste-x', payload });
    expect(r.statusCode).toBe(404);
  });

  it('não exige sessão; token certo → 200 e processa em segundo plano', async () => {
    const enviar = vi.fn(async () => ({ id: 'OUT' }));
    definirDependenciasBot({ enviar, agora: () => new Date() });
    db.mensagem.findFirst.mockResolvedValue(null);
    db.funcionario.findMany.mockResolvedValue([]); // desconhecido
    db.mensagem.create.mockResolvedValue({ id: 1 });
    const r = await app.inject({ method: 'POST', url: '/api/webhooks/evolution/token-de-teste', payload });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ ok: true });
    await aguardarProcessamentos();
    expect(db.mensagem.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ direcao: 'RECEBIDA', telefone: '5511988887777', funcionarioId: null }) }),
    );
    expect(enviar).toHaveBeenCalledTimes(1); // padrão: avisa o desconhecido (1ª mensagem)
    definirDependenciasBot(undefined);
  });

  it('connection.update → 200 (só log)', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/webhooks/evolution/token-de-teste',
      payload: { event: 'connection.update', instance: 'escala', data: { instance: 'escala', state: 'open', statusReason: 200 } },
    });
    expect(r.statusCode).toBe(200);
  });

  it('corpo inválido → 400', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/webhooks/evolution/token-de-teste',
      headers: { 'content-type': 'application/json' },
      payload: '[1,2]',
    });
    expect(r.statusCode).toBe(400);
  });
});

describe('/api/configuracoes', () => {
  it('GESTOR → 403', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/configuracoes', headers: { cookie: cookieGestor } });
    expect(r.statusCode).toBe(403);
  });

  it('GET completa com padrões', async () => {
    db.configuracao.findMany.mockResolvedValue([{ chave: 'bot.sem_turno', valor: 'Sem turnos.' }]);
    const r = await app.inject({ method: 'GET', url: '/api/configuracoes', headers: { cookie: cookieAdmin } });
    expect(r.statusCode).toBe(200);
    expect(r.json()['bot.sem_turno']).toBe('Sem turnos.');
    expect(r.json()['bot.numero_desconhecido'].acao).toBe('responder');
    expect(typeof r.json()['bot.menu']).toBe('string');
  });

  it('PUT parcial válido grava só a chave enviada', async () => {
    db.configuracao.upsert.mockResolvedValue({});
    const r = await app.inject({
      method: 'PUT',
      url: '/api/configuracoes',
      headers: { cookie: cookieAdmin },
      payload: { 'bot.numero_desconhecido': { acao: 'responder', texto: 'Procure o RH.' } },
    });
    expect(r.statusCode).toBe(200);
    expect(db.configuracao.upsert).toHaveBeenCalledTimes(1);
    expect(db.configuracao.upsert.mock.calls[0][0].where).toEqual({ chave: 'bot.numero_desconhecido' });
  });

  it('PUT com chave desconhecida ou valor inválido → 400', async () => {
    const r1 = await app.inject({ method: 'PUT', url: '/api/configuracoes', headers: { cookie: cookieAdmin }, payload: { 'bot.xyz': 1 } });
    expect(r1.statusCode).toBe(400);
    const r2 = await app.inject({
      method: 'PUT',
      url: '/api/configuracoes',
      headers: { cookie: cookieAdmin },
      payload: { 'bot.numero_desconhecido': { acao: 'responder', texto: '' } },
    });
    expect(r2.statusCode).toBe(400);
  });
});

describe('/api/regras-lembrete', () => {
  it('POST ANTECEDENCIA sem minutos → 400', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/regras-lembrete',
      headers: { cookie: cookieAdmin },
      payload: { nome: 'X', tipo: 'ANTECEDENCIA', template: 'oi', ativo: true },
    });
    expect(r.statusCode).toBe(400);
  });

  it('POST VESPERA zera minutos', async () => {
    db.regraLembrete.create.mockImplementation(async ({ data }: { data: object }) => ({ id: 5, ...data }));
    const r = await app.inject({
      method: 'POST',
      url: '/api/regras-lembrete',
      headers: { cookie: cookieAdmin },
      payload: { nome: 'Véspera', tipo: 'VESPERA', minutos: 30, horario: '18:00', template: 'Amanhã às {inicio}', ativo: true },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ id: 5, tipo: 'VESPERA', minutos: null, horario: '18:00' });
  });

  it('POST /previa renderiza com dados de exemplo', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/regras-lembrete/previa',
      headers: { cookie: cookieAdmin },
      payload: { template: 'Olá {nome}, {inicio}–{fim} no setor {setor}' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ texto: 'Olá Maria Silva, 07:00–19:00 no setor Recepção' });
  });

  it('GESTOR → 403', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/regras-lembrete', headers: { cookie: cookieGestor } });
    expect(r.statusCode).toBe(403);
  });
});

describe('/api/mensagens', () => {
  beforeEach(() => {
    db.mensagem.findMany.mockResolvedValue([]);
    db.mensagem.count.mockResolvedValue(0);
  });

  it('GESTOR: filtra pelos setores (exclui mensagens sem funcionário)', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/mensagens?pagina=2&porPagina=10&direcao=RECEBIDA', headers: { cookie: cookieGestor } });
    expect(r.statusCode).toBe(200);
    const arg = db.mensagem.findMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({ direcao: 'RECEBIDA', funcionario: { setorId: { in: [10] } } });
    expect(arg.skip).toBe(10);
    expect(arg.take).toBe(10);
  });

  it('ADMIN: sem filtro de setor; serializa item', async () => {
    db.mensagem.findMany.mockResolvedValue([
      { id: 1, direcao: 'ENVIADA', telefone: '5551999998888', funcionarioId: 3, funcionario: { id: 3, nome: 'Ana' }, conteudo: 'x', origem: 'LEMBRETE', status: 'OK', erro: null, criadoEm: new Date('2026-10-01T10:00:00Z'), evolutionMsgId: 'a' },
    ]);
    db.mensagem.count.mockResolvedValue(1);
    const r = await app.inject({ method: 'GET', url: '/api/mensagens', headers: { cookie: cookieAdmin } });
    expect(db.mensagem.findMany.mock.calls[0][0].where).toEqual({});
    expect(r.json()).toEqual({
      itens: [{ id: 1, direcao: 'ENVIADA', telefone: '5551999998888', funcionarioId: 3, funcionario: { id: 3, nome: 'Ana' }, conteudo: 'x', origem: 'LEMBRETE', status: 'OK', erro: null, criadoEm: '2026-10-01T10:00:00.000Z' }],
      total: 1,
    });
  });

  it('filtro inválido → 400', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/mensagens?origem=XYZ', headers: { cookie: cookieAdmin } });
    expect(r.statusCode).toBe(400);
  });
});

describe('/api/whatsapp', () => {
  it('status: instância inexistente', async () => {
    fetchMock.mockResolvedValueOnce(
      respostaJson(404, { status: 404, error: 'Not Found', response: { message: ['The "escala" instance does not exist'] } }),
    );
    const r = await app.inject({ method: 'GET', url: '/api/whatsapp/status', headers: { cookie: cookieGestor } });
    expect(r.json()).toEqual({ estado: 'inexistente' });
  });

  it('status: open com número (envia header apikey)', async () => {
    fetchMock
      .mockResolvedValueOnce(respostaJson(200, { instance: { instanceName: 'escala', state: 'open' } }))
      .mockResolvedValueOnce(respostaJson(200, [{ name: 'escala', connectionStatus: 'open', ownerJid: '5551999998888@s.whatsapp.net' }]));
    const r = await app.inject({ method: 'GET', url: '/api/whatsapp/status', headers: { cookie: cookieAdmin } });
    expect(r.json()).toEqual({ estado: 'open', numero: '5551999998888' });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).apikey).toBe('chave-teste');
  });

  it('status: Evolution fora do ar → erro', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const r = await app.inject({ method: 'GET', url: '/api/whatsapp/status', headers: { cookie: cookieAdmin } });
    expect(r.json().estado).toBe('erro');
  });

  it('conectar (ADMIN): cria instância, configura webhook e devolve QR', async () => {
    fetchMock
      .mockResolvedValueOnce(respostaJson(404, { response: { message: ['The "escala" instance does not exist'] } }))
      .mockResolvedValueOnce(respostaJson(201, { instance: { instanceName: 'escala', status: 'connecting' }, qrcode: { code: '2@x', base64: 'data:image/png;base64,AAA' } }))
      .mockResolvedValueOnce(respostaJson(201, { enabled: true }));
    const r = await app.inject({ method: 'POST', url: '/api/whatsapp/conectar', headers: { cookie: cookieAdmin } });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ estado: 'connecting', qrcode: 'data:image/png;base64,AAA' });
    const [urlWebhook, initWebhook] = fetchMock.mock.calls[2];
    expect(String(urlWebhook)).toBe('http://evolution:8080/webhook/set/escala');
    expect(JSON.parse(String((initWebhook as RequestInit).body))).toEqual({
      webhook: {
        enabled: true,
        url: 'http://app:3000/api/webhooks/evolution/token-de-teste',
        byEvents: false,
        base64: false,
        events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'QRCODE_UPDATED'],
      },
    });
  });

  it('conectar: GESTOR → 403', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/whatsapp/conectar', headers: { cookie: cookieGestor } });
    expect(r.statusCode).toBe(403);
  });

  it('desconectar já desconectado → 204', async () => {
    fetchMock.mockResolvedValueOnce(respostaJson(400, { response: { message: ['The "escala" instance is not connected'] } }));
    const r = await app.inject({ method: 'POST', url: '/api/whatsapp/desconectar', headers: { cookie: cookieAdmin } });
    expect(r.statusCode).toBe(204);
  });
});
