/**
 * Testes da API com `app.inject` e Prisma mockado (sem banco).
 */
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  usuario: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  funcionario: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  setor: { findUnique: vi.fn(), findMany: vi.fn() },
  turno: { findMany: vi.fn(), create: vi.fn() },
}));
vi.mock('../lib/prisma', () => ({ prisma: db }));

import { Prisma } from '@prisma/client';
import { criarApp } from '../app';
import { MAX_FALHAS_POR_CONTA, limparBloqueios } from '../auth/bloqueio';
import { MAX_NOME } from '../lib/validacao';

const senhaHash = bcrypt.hashSync('senha-certa-123', 4);
const admin = { id: 1, nome: 'Admin', email: 'admin@x.com', perfil: 'ADMIN', ativo: true, sessaoVersao: 0, senhaHash, setores: [] };
const gestor = { id: 2, nome: 'Gestor', email: 'gestor@x.com', perfil: 'GESTOR', ativo: true, sessaoVersao: 0, senhaHash, setores: [{ setorId: 10 }] };

let app: FastifyInstance;

function usuarioPorEmailOuId(args: { where: { email?: string; id?: number } }) {
  const lista = [admin, gestor];
  return Promise.resolve(lista.find((u) => u.email === args.where.email || u.id === args.where.id) ?? null);
}

let ipSeq = 0;
async function login(email: string): Promise<string> {
  // IP diferente a cada login para não esbarrar no rate limit (5/min)
  const remoteAddress = `10.0.0.${++ipSeq}`;
  const r = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress, payload: { email, senha: 'senha-certa-123' } });
  expect(r.statusCode).toBe(200);
  const c = r.cookies.find((x) => x.name === 'sessao');
  expect(c?.httpOnly).toBe(true);
  expect(c?.sameSite).toBe('Strict');
  return `sessao=${c!.value}`;
}

beforeAll(async () => {
  app = await criarApp({ logger: false });
  await app.ready();
});
afterAll(() => app.close());
beforeEach(() => {
  vi.clearAllMocks();
  db.usuario.findUnique.mockImplementation(usuarioPorEmailOuId);
});

describe('básico', () => {
  it('GET /api/health', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/health' });
    expect(r.json()).toEqual({ ok: true });
  });
  it('rota inexistente → 404 {erro}', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/nada' });
    expect(r.statusCode).toBe(404);
    expect(r.json().erro).toBeTypeOf('string');
  });
  it('sem cookie → 401', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/funcionarios' });
    expect(r.statusCode).toBe(401);
    expect(r.json()).toHaveProperty('erro');
  });
  it('escala sem cookie → 401', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/escala' });
    expect(r.statusCode).toBe(401);
  });
});

describe('auth', () => {
  it('login com senha errada → 401', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '10.1.0.1', payload: { email: 'admin@x.com', senha: 'errada' } });
    expect(r.statusCode).toBe(401);
    expect(r.json().erro).toBe('E-mail ou senha inválidos');
  });
  it('login sem corpo válido → 400 com detalhes', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '10.1.0.2', payload: { email: '' } });
    expect(r.statusCode).toBe(400);
    expect(Array.isArray(r.json().detalhes)).toBe(true);
  });
  it('login ok + /me', async () => {
    const cookie = await login('gestor@x.com');
    const r = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(r.statusCode).toBe(200);
    expect(r.json().usuario).toEqual({ id: 2, nome: 'Gestor', email: 'gestor@x.com', perfil: 'GESTOR', ativo: true, setorIds: [10] });
  });
  it('sessão de usuário desativado é rejeitada', async () => {
    const cookie = await login('gestor@x.com');
    db.usuario.findUnique.mockResolvedValueOnce({ ...gestor, ativo: false });
    const r = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(r.statusCode).toBe(401);
  });
  it('logout → 204', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(r.statusCode).toBe(204);
  });
});

describe('perfil e escopo de setor', () => {
  it('gestor não acessa /api/usuarios (403)', async () => {
    const cookie = await login('gestor@x.com');
    const r = await app.inject({ method: 'GET', url: '/api/usuarios', headers: { cookie } });
    expect(r.statusCode).toBe(403);
  });
  it('gestor lista funcionários filtrado pelos seus setores', async () => {
    const cookie = await login('gestor@x.com');
    db.funcionario.findMany.mockResolvedValue([]);
    const r = await app.inject({ method: 'GET', url: '/api/funcionarios?ativo=true', headers: { cookie } });
    expect(r.statusCode).toBe(200);
    const where = db.funcionario.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ setorId: { in: [10] } });
    expect(where.AND).toContainEqual({ ativo: true });
  });
  it('gestor filtrando setor alheio → 403', async () => {
    const cookie = await login('gestor@x.com');
    const r = await app.inject({ method: 'GET', url: '/api/funcionarios?setorId=99', headers: { cookie } });
    expect(r.statusCode).toBe(403);
  });
  it('gestor lendo funcionário de outro setor → 404', async () => {
    const cookie = await login('gestor@x.com');
    db.funcionario.findUnique.mockResolvedValue({ id: 5, setorId: 99 });
    const r = await app.inject({ method: 'GET', url: '/api/funcionarios/5', headers: { cookie } });
    expect(r.statusCode).toBe(404);
  });
  it('gestor criando funcionário em outro setor → 403', async () => {
    const cookie = await login('gestor@x.com');
    const r = await app.inject({
      method: 'POST', url: '/api/funcionarios', headers: { cookie },
      payload: { nome: 'Ana', telefone: '51 99999-8888', setorId: 99, ativo: true },
    });
    expect(r.statusCode).toBe(403);
  });
});

describe('funcionários', () => {
  const payload = { nome: 'Ana', telefone: '(51) 99999-8888', setorId: 10, ativo: true };
  it('telefone inválido → 400', async () => {
    const cookie = await login('admin@x.com');
    db.setor.findUnique.mockResolvedValue({ id: 10, nome: 'Recepção', ativo: true });
    const r = await app.inject({ method: 'POST', url: '/api/funcionarios', headers: { cookie }, payload: { ...payload, telefone: '123' } });
    expect(r.statusCode).toBe(400);
  });
  it('telefone duplicado (variação do 9º dígito) → 409', async () => {
    const cookie = await login('admin@x.com');
    db.setor.findUnique.mockResolvedValue({ id: 10, nome: 'Recepção', ativo: true });
    db.funcionario.findFirst.mockResolvedValue({ id: 7, nome: 'Bia' });
    const r = await app.inject({ method: 'POST', url: '/api/funcionarios', headers: { cookie }, payload });
    expect(r.statusCode).toBe(409);
    const where = db.funcionario.findFirst.mock.calls[0][0].where;
    expect(where.OR[0].telefone.in).toEqual(['5551999998888', '555199998888']);
  });
  it('cria normalizando telefone', async () => {
    const cookie = await login('admin@x.com');
    db.setor.findUnique.mockResolvedValue({ id: 10, nome: 'Recepção', ativo: true });
    db.funcionario.findFirst.mockResolvedValue(null);
    db.funcionario.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 1, ...data, setor: { id: 10, nome: 'Recepção' } }),
    );
    const r = await app.inject({ method: 'POST', url: '/api/funcionarios', headers: { cookie }, payload });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ telefone: '5551999998888', telefoneAlt: '555199998888', cargo: null, setor: { id: 10 } });
  });
});

describe('turnos', () => {
  it('viraNoite calculado', async () => {
    const cookie = await login('admin@x.com');
    db.turno.create.mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data }));
    const r = await app.inject({
      method: 'POST', url: '/api/turnos', headers: { cookie },
      payload: { nome: 'Noturno', horaInicio: '19:00', horaFim: '07:00', cor: '#1E40AF', ativo: true },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ viraNoite: true, cor: '#1e40af' });
  });
  it('hora inválida → 400', async () => {
    const cookie = await login('admin@x.com');
    const r = await app.inject({
      method: 'POST', url: '/api/turnos', headers: { cookie },
      payload: { nome: 'X', horaInicio: '25:00', horaFim: '07:00' },
    });
    expect(r.statusCode).toBe(400);
  });
});

describe('rate limit', () => {
  it('6ª tentativa de login no minuto → 429', async () => {
    const tentar = () =>
      app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '10.9.9.9', payload: { email: 'x@x.com', senha: 'y' } });
    for (let i = 0; i < 5; i++) expect((await tentar()).statusCode).toBe(401);
    const r = await tentar();
    expect(r.statusCode).toBe(429);
    expect(r.json().erro).toMatch(/Muitas tentativas/);
  });
});

describe('bloqueio por conta', () => {
  beforeEach(() => limparBloqueios());

  it(`${MAX_FALHAS_POR_CONTA} senhas erradas de IPs diferentes bloqueiam o e-mail (mesmo com a senha certa)`, async () => {
    for (let i = 0; i < MAX_FALHAS_POR_CONTA; i++) {
      const r = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: `10.7.${i}.1`, payload: { email: 'admin@x.com', senha: 'errada' } });
      expect(r.statusCode).toBe(401);
    }
    const r = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '10.7.99.1', payload: { email: 'admin@x.com', senha: 'senha-certa-123' } });
    expect(r.statusCode).toBe(429);
    expect(r.json().erro).toMatch(/Muitas tentativas para este usuário/);
    // outro usuário segue liberado
    await login('gestor@x.com');
  });

  it('e-mail inexistente bloqueia do mesmo jeito (não revela contas)', async () => {
    for (let i = 0; i < MAX_FALHAS_POR_CONTA; i++) {
      await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: `10.8.${i}.1`, payload: { email: 'nao@existe.com', senha: 'x' } });
    }
    const r = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '10.8.99.1', payload: { email: 'nao@existe.com', senha: 'x' } });
    expect(r.statusCode).toBe(429);
  });

  it('login certo zera as falhas', async () => {
    for (let i = 0; i < MAX_FALHAS_POR_CONTA - 1; i++) {
      await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: `10.6.${i}.1`, payload: { email: 'admin@x.com', senha: 'errada' } });
    }
    await login('admin@x.com');
    const r = await app.inject({ method: 'POST', url: '/api/auth/login', remoteAddress: '10.6.99.1', payload: { email: 'admin@x.com', senha: 'errada' } });
    expect(r.statusCode).toBe(401);
  });
});

describe('limites e erros sem detalhes internos', () => {
  it('nome de funcionário muito longo → 400', async () => {
    const cookie = await login('admin@x.com');
    const r = await app.inject({
      method: 'POST',
      url: '/api/funcionarios',
      headers: { cookie },
      payload: { nome: 'x'.repeat(MAX_NOME + 1), telefone: '51999998888', setorId: 10 },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().erro).toMatch(/muito longo/);
  });

  it('JSON malformado → 400 sem a mensagem interna do parser', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      remoteAddress: '10.5.0.1',
      headers: { 'content-type': 'application/json' },
      payload: '{"email":',
    });
    expect(r.statusCode).toBe(400);
    expect(r.json()).toEqual({ erro: 'Requisição inválida' });
  });

  it('P2002 → 409 sem nomes de colunas', async () => {
    const cookie = await login('admin@x.com');
    db.turno.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'teste', meta: { target: ['nome'] } }),
    );
    const r = await app.inject({
      method: 'POST',
      url: '/api/turnos',
      headers: { cookie },
      payload: { nome: 'Dia', horaInicio: '07:00', horaFim: '19:00' },
    });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toEqual({ erro: 'Registro duplicado' });
  });
});

describe('senha nova', () => {
  it('mais de 72 bytes → 400 (bcrypt truncaria)', async () => {
    const cookie = await login('gestor@x.com');
    db.usuario.findUniqueOrThrow.mockResolvedValue(gestor);
    const r = await app.inject({
      method: 'POST',
      url: '/api/auth/senha',
      remoteAddress: '10.4.0.1',
      headers: { cookie },
      payload: { senhaAtual: 'senha-certa-123', novaSenha: 'ç'.repeat(37) },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().erro).toMatch(/no máximo 72/);
  });
});
