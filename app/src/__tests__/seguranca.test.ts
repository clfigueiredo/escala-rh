/**
 * Correções de segurança: token do webhook fora dos logs, webhook valida token antes
 * do parse, revogação de sessão (sessao_versao), 409 sem vazamento, env sem ADMIN_*.
 * Prisma mockado com estado em memória (sem banco).
 */
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type UsuarioMock = {
  id: number;
  nome: string;
  email: string;
  perfil: 'ADMIN' | 'GESTOR';
  ativo: boolean;
  sessaoVersao: number;
  senhaHash: string;
  setores: { setorId: number }[];
};

const estado = vi.hoisted(() => ({ usuarios: [] as UsuarioMock[] }));

function aplicar(u: UsuarioMock, data: Record<string, unknown>) {
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    if (v && typeof v === 'object' && 'increment' in v) {
      (u as unknown as Record<string, number>)[k] += (v as { increment: number }).increment;
    } else {
      (u as unknown as Record<string, unknown>)[k] = v;
    }
  }
  return { ...u, setores: [...u.setores] };
}

const db = vi.hoisted(() => ({
  usuario: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  usuarioSetor: { deleteMany: vi.fn(), createMany: vi.fn() },
  setor: { findUnique: vi.fn(), count: vi.fn() },
  funcionario: { findFirst: vi.fn(), create: vi.fn() },
  configuracao: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock('../lib/prisma', () => ({ prisma: db }));

import { criarApp } from '../app';
import { gravarHeartbeat } from '../lib/heartbeat';
import { mascararSegredos, serializarErro, serializarReq } from '../lib/log';
import { confiarProxy } from '../lib/proxy';

const TOKEN = 'token-de-teste'; // WEBHOOK_TOKEN do vitest.config.ts
const senhaHash = bcrypt.hashSync('senha-certa-123', 4);

function resetUsuarios() {
  estado.usuarios = [
    { id: 1, nome: 'Admin', email: 'admin@x.com', perfil: 'ADMIN', ativo: true, sessaoVersao: 0, senhaHash, setores: [] },
    { id: 2, nome: 'Gestor', email: 'gestor@x.com', perfil: 'GESTOR', ativo: true, sessaoVersao: 0, senhaHash, setores: [{ setorId: 10 }] },
  ];
}
function acharUsuario(where: { id?: number; email?: string }) {
  return estado.usuarios.find((u) => (where.id !== undefined ? u.id === where.id : u.email === where.email));
}

function configurarMocks() {
  db.usuario.findUnique.mockImplementation(async ({ where }) => {
    const u = acharUsuario(where);
    return u ? { ...u, setores: [...u.setores] } : null;
  });
  db.usuario.findUniqueOrThrow.mockImplementation(async ({ where }) => {
    const u = acharUsuario(where);
    if (!u) throw new Error('não encontrado');
    return { ...u, setores: [...u.setores] };
  });
  db.usuario.update.mockImplementation(async ({ where, data }) => {
    const u = acharUsuario(where);
    if (!u) throw new Error('não encontrado');
    return aplicar(u, data);
  });
  db.usuario.updateMany.mockImplementation(async ({ where, data }) => {
    const alvos = estado.usuarios.filter((u) => u.id === where.id && u.sessaoVersao === where.sessaoVersao);
    alvos.forEach((u) => aplicar(u, data));
    return { count: alvos.length };
  });
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.setor.findUnique.mockResolvedValue({ id: 10, nome: 'Recepção', ativo: true });
  db.configuracao.findMany.mockResolvedValue([]);
}

let app: FastifyInstance;
let ipSeq = 0;
const linhasLog: string[] = [];

async function login(email: string): Promise<string> {
  const r = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    remoteAddress: `10.7.0.${++ipSeq}`,
    payload: { email, senha: 'senha-certa-123' },
  });
  expect(r.statusCode).toBe(200);
  return `sessao=${r.cookies.find((c) => c.name === 'sessao')!.value}`;
}
function me(cookie: string) {
  return app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
}

beforeAll(async () => {
  const stream = new Writable({
    write(chunk, _enc, cb) {
      linhasLog.push(String(chunk));
      cb();
    },
  });
  app = await criarApp({ logStream: stream });
  await app.ready();
});
afterAll(() => app.close());
beforeEach(() => {
  vi.clearAllMocks();
  resetUsuarios();
  configurarMocks();
});

describe('token do webhook nunca vai para o log', () => {
  it('serializer de req mascara o segmento do token', () => {
    const r = serializarReq({
      method: 'POST',
      url: `/api/webhooks/evolution/${TOKEN}?x=1`,
      host: 'app:3000',
      ip: '172.18.0.5',
      socket: { remotePort: 1234 },
    } as never);
    expect(r.url).toBe('/api/webhooks/evolution/***?x=1');
    expect(JSON.stringify(r)).not.toContain(TOKEN);
  });

  it('mascara qualquer token no caminho e o token literal em textos', () => {
    expect(mascararSegredos('/api/webhooks/evolution/qualquer-coisa')).toBe('/api/webhooks/evolution/***');
    expect(mascararSegredos(`url http://app:3000/api/webhooks/evolution/${TOKEN} inválida`)).toBe(
      'url http://app:3000/api/webhooks/evolution/*** inválida',
    );
    expect(mascararSegredos(`segredo=${TOKEN}`)).toBe('segredo=***');
  });

  it('serializer de erro mascara mensagem, stack e propriedades', () => {
    const e = Object.assign(new Error(`falhou em /api/webhooks/evolution/${TOKEN}`), {
      detalhes: { url: `http://app:3000/api/webhooks/evolution/${TOKEN}` },
    });
    const s = serializarErro(e);
    expect(JSON.stringify(s)).not.toContain(TOKEN);
    expect(s.message).toBe('falhou em /api/webhooks/evolution/***');
    expect(s.type).toBe('Error');
  });

  it('requests reais ao webhook não imprimem o token (log completo)', async () => {
    linhasLog.length = 0;
    await app.inject({
      method: 'POST',
      url: `/api/webhooks/evolution/${TOKEN}`,
      payload: { event: 'qrcode.updated', instance: 'escala', data: {} },
    });
    await app.inject({
      method: 'POST',
      url: `/api/webhooks/evolution/${TOKEN}`,
      headers: { 'content-type': 'application/json' },
      payload: '{quebrado',
    });
    const log = linhasLog.join('');
    expect(log).toContain('incoming request');
    expect(log).toContain('/api/webhooks/evolution/***');
    expect(log).not.toContain(TOKEN);
  });
});

describe('webhook: token validado antes do parse', () => {
  it('token errado + JSON malformado → 404', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/webhooks/evolution/token-errado',
      headers: { 'content-type': 'application/json' },
      payload: '{isto não é json',
    });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual({ erro: 'Não encontrado' });
  });

  it('token errado + corpo acima de 1 MB → 404 (não 413)', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/webhooks/evolution/token-errado',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ x: 'a'.repeat(1024 * 1024 + 10) }),
    });
    expect(r.statusCode).toBe(404);
  });

  it('token certo + JSON malformado → 400', async () => {
    const r = await app.inject({
      method: 'POST',
      url: `/api/webhooks/evolution/${TOKEN}`,
      headers: { 'content-type': 'application/json' },
      payload: '{isto não é json',
    });
    expect(r.statusCode).toBe(400);
  });

  it('token certo + corpo acima de 1 MB → 413', async () => {
    const r = await app.inject({
      method: 'POST',
      url: `/api/webhooks/evolution/${TOKEN}`,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ x: 'a'.repeat(1024 * 1024 + 10) }),
    });
    expect(r.statusCode).toBe(413);
  });
});

describe('revogação de sessão (sessao_versao)', () => {
  it('logout revoga o JWT no servidor', async () => {
    const cookie = await login('gestor@x.com');
    expect((await me(cookie)).statusCode).toBe(200);
    const r = await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(r.statusCode).toBe(204);
    expect(estado.usuarios[1].sessaoVersao).toBe(1);
    expect((await me(cookie)).statusCode).toBe(401);
  });

  it('logout com token já revogado não incrementa de novo', async () => {
    const cookie = await login('gestor@x.com');
    await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    await app.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(estado.usuarios[1].sessaoVersao).toBe(1);
  });

  it('troca de senha derruba as outras sessões e renova a atual', async () => {
    const atual = await login('gestor@x.com');
    const outra = await login('gestor@x.com');
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/senha',
      remoteAddress: '10.7.1.1',
      headers: { cookie: atual },
      payload: { senhaAtual: 'senha-certa-123', novaSenha: 'nova-senha-456' },
    });
    expect(r.statusCode).toBe(204);
    const novo = r.cookies.find((c) => c.name === 'sessao');
    expect(novo?.value).toBeTruthy();
    expect(novo?.httpOnly).toBe(true);
    expect((await me(`sessao=${novo!.value}`)).statusCode).toBe(200);
    expect((await me(atual)).statusCode).toBe(401);
    expect((await me(outra)).statusCode).toBe(401);
  });

  it('admin altera a senha do gestor → sessão do gestor cai', async () => {
    const cAdmin = await login('admin@x.com');
    const cGestor = await login('gestor@x.com');
    const r = await app.inject({
      method: 'PUT',
      url: '/api/usuarios/2',
      headers: { cookie: cAdmin },
      payload: { senha: 'outra-senha-789' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).not.toHaveProperty('sessaoVersao');
    expect((await me(cGestor)).statusCode).toBe(401);
    expect((await me(cAdmin)).statusCode).toBe(200);
  });

  it('admin altera o perfil ou desativa → sessão cai', async () => {
    const cAdmin = await login('admin@x.com');
    let cGestor = await login('gestor@x.com');
    await app.inject({ method: 'PUT', url: '/api/usuarios/2', headers: { cookie: cAdmin }, payload: { perfil: 'ADMIN' } });
    expect((await me(cGestor)).statusCode).toBe(401);

    resetUsuarios();
    cGestor = await login('gestor@x.com');
    await app.inject({ method: 'PUT', url: '/api/usuarios/2', headers: { cookie: cAdmin }, payload: { ativo: false } });
    expect(estado.usuarios[1].sessaoVersao).toBe(1);
    estado.usuarios[1].ativo = true; // mesmo reativado, o token antigo continua inválido
    expect((await me(cGestor)).statusCode).toBe(401);
  });

  it('alterar só o nome não derruba a sessão', async () => {
    const cAdmin = await login('admin@x.com');
    const cGestor = await login('gestor@x.com');
    await app.inject({ method: 'PUT', url: '/api/usuarios/2', headers: { cookie: cAdmin }, payload: { nome: 'Gestora' } });
    expect(estado.usuarios[1].sessaoVersao).toBe(0);
    expect((await me(cGestor)).statusCode).toBe(200);
  });

  it('admin troca a própria senha pelo PUT → recebe cookie novo', async () => {
    const cAdmin = await login('admin@x.com');
    const r = await app.inject({ method: 'PUT', url: '/api/usuarios/1', headers: { cookie: cAdmin }, payload: { senha: 'nova-senha-admin' } });
    expect(r.statusCode).toBe(200);
    const novo = r.cookies.find((c) => c.name === 'sessao');
    expect((await me(cAdmin)).statusCode).toBe(401);
    expect((await me(`sessao=${novo!.value}`)).statusCode).toBe(200);
  });

  it('POST /auth/senha tem rate limit (6ª no minuto → 429)', async () => {
    const cookie = await login('gestor@x.com');
    const tentar = () =>
      app.inject({
        method: 'POST',
        url: '/api/auth/senha',
        remoteAddress: '10.7.2.2',
        headers: { cookie },
        payload: { senhaAtual: 'errada', novaSenha: 'nova-senha-456' },
      });
    for (let i = 0; i < 5; i++) expect((await tentar()).statusCode).toBe(400);
    expect((await tentar()).statusCode).toBe(429);
  });
});

describe('409 de telefone duplicado sem vazamento', () => {
  const payload = { nome: 'Ana', telefone: '(51) 99999-8888', setorId: 10, ativo: true };

  it('gestor: número de funcionário de outro setor → só "Telefone já cadastrado"', async () => {
    const cookie = await login('gestor@x.com');
    db.funcionario.findFirst.mockResolvedValue({ id: 77, nome: 'Fulana de Outro Setor', setorId: 99 });
    const r = await app.inject({ method: 'POST', url: '/api/funcionarios', headers: { cookie }, payload });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toEqual({ erro: 'Telefone já cadastrado' });
    expect(r.body).not.toContain('Fulana');
    expect(r.body).not.toContain('77');
  });

  it('gestor: número de funcionário do próprio setor → nome e id', async () => {
    const cookie = await login('gestor@x.com');
    db.funcionario.findFirst.mockResolvedValue({ id: 7, nome: 'Bia', setorId: 10 });
    const r = await app.inject({ method: 'POST', url: '/api/funcionarios', headers: { cookie }, payload });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toEqual({ erro: 'Telefone já cadastrado para Bia', detalhes: { funcionarioId: 7 } });
  });

  it('admin vê nome e id mesmo de outro setor', async () => {
    const cookie = await login('admin@x.com');
    db.funcionario.findFirst.mockResolvedValue({ id: 77, nome: 'Fulana', setorId: 99 });
    const r = await app.inject({ method: 'POST', url: '/api/funcionarios', headers: { cookie }, payload });
    expect(r.json().detalhes).toEqual({ funcionarioId: 77 });
  });
});

describe('trustProxy de um salto', () => {
  it('confia só no salto imediato em rede privada', () => {
    expect(confiarProxy('172.18.0.3', 0)).toBe(true);
    expect(confiarProxy('::ffff:172.18.0.3', 0)).toBe(true);
    expect(confiarProxy('172.18.0.3', 1)).toBe(false);
    expect(confiarProxy('8.8.8.8', 0)).toBe(false);
  });

  it('request.ip = último X-Forwarded-For (anotado pelo Caddy), ignora os forjados', async () => {
    const tentar = (forjado: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/login',
        remoteAddress: '172.18.0.9',
        headers: { 'x-forwarded-for': `${forjado}, 203.0.113.50` },
        payload: { email: 'x@x.com', senha: 'y' },
      });
    for (let i = 0; i < 5; i++) expect((await tentar(`1.1.1.${i}`)).statusCode).toBe(401);
    expect((await tentar('1.1.1.99')).statusCode).toBe(429);
    // outro cliente real (outro IP anotado pelo Caddy) não é afetado
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: '172.18.0.9',
      headers: { 'x-forwarded-for': '203.0.113.51' },
      payload: { email: 'x@x.com', senha: 'y' },
    });
    expect(r.statusCode).toBe(401);
  });
});

describe('heartbeat do worker', () => {
  it('grava timestamp ISO e atualiza o mtime', async () => {
    const arq = join(mkdtempSync(join(tmpdir(), 'hb-')), 'worker-heartbeat');
    const quando = new Date('2026-09-30T12:00:00Z');
    expect(await gravarHeartbeat(arq, quando)).toBe(true);
    expect(readFileSync(arq, 'utf8').trim()).toBe('2026-09-30T12:00:00.000Z');
    expect(Date.now() - statSync(arq).mtimeMs).toBeLessThan(5_000);
  });
  it('falha de escrita não lança', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await gravarHeartbeat('/diretorio-que-nao-existe/hb')).toBe(false);
    spy.mockRestore();
  });
});

describe('env sem ADMIN_*', () => {
  it('carrega sem ADMIN_EMAIL/ADMIN_PASSWORD (e trata vazio como ausente)', async () => {
    const salvo = { e: process.env.ADMIN_EMAIL, p: process.env.ADMIN_PASSWORD };
    try {
      delete process.env.ADMIN_EMAIL;
      process.env.ADMIN_PASSWORD = '';
      vi.resetModules();
      const { carregarEnv } = await import('../config/env');
      const env = carregarEnv();
      expect(env.ADMIN_EMAIL).toBeUndefined();
      expect(env.ADMIN_PASSWORD).toBeUndefined();
      expect(env.WEBHOOK_TOKEN).toBe(TOKEN);
    } finally {
      process.env.ADMIN_EMAIL = salvo.e;
      process.env.ADMIN_PASSWORD = salvo.p;
      vi.resetModules();
    }
  });
});
