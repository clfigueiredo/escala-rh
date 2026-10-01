/**
 * Testes de rota (app.inject + Prisma mockado) de /api/escala, /api/escala/gerar,
 * /api/ausencias e /api/padroes.
 */
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const d = {
    usuario: { findUnique: vi.fn() },
    funcionario: { findUnique: vi.fn(), findMany: vi.fn() },
    setor: { findUnique: vi.fn() },
    turno: { findUnique: vi.fn() },
    padraoEscala: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    plantao: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    ausencia: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    lembreteEnviado: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  };
  return d;
});
vi.mock('../../lib/prisma', () => ({ prisma: db }));

import { criarApp } from '../../app';

const senhaHash = bcrypt.hashSync('senha-certa-123', 4);
const admin = { id: 1, nome: 'Admin', email: 'admin@x.com', perfil: 'ADMIN', ativo: true, senhaHash, setores: [] };
const gestor = { id: 2, nome: 'Gestor', email: 'gestor@x.com', perfil: 'GESTOR', ativo: true, senhaHash, setores: [{ setorId: 10 }] };

let app: FastifyInstance;
let ipSeq = 0;
const cookies: Record<string, string> = {};

async function login(email: string): Promise<string> {
  if (cookies[email]) return cookies[email];
  const r = await app.inject({
    method: 'POST', url: '/api/auth/login', remoteAddress: `10.2.0.${++ipSeq}`,
    payload: { email, senha: 'senha-certa-123' },
  });
  expect(r.statusCode).toBe(200);
  cookies[email] = `sessao=${r.cookies.find((x) => x.name === 'sessao')!.value}`;
  return cookies[email];
}

const ana = { id: 3, nome: 'Ana', setorId: 10, ativo: true };
const bia = { id: 4, nome: 'Bia', setorId: 99, ativo: true };
const funcionarios = [ana, bia];

function plantaoCompleto(over: Record<string, unknown> = {}) {
  return {
    id: 1, funcionarioId: 3, setorId: 10, turnoId: 1,
    inicio: new Date('2026-10-06T10:00:00Z'), fim: new Date('2026-10-06T22:00:00Z'),
    status: 'AGENDADO', origem: 'MANUAL', observacao: null, criadoPorId: 1,
    funcionario: { id: 3, nome: 'Ana' }, setor: { id: 10, nome: 'Recepção' }, turno: { id: 1, nome: 'Dia', cor: '#3b82f6' },
    ...over,
  };
}

beforeAll(async () => {
  app = await criarApp({ logger: false });
  await app.ready();
});
afterAll(() => app.close());
beforeEach(() => {
  vi.resetAllMocks();
  db.usuario.findUnique.mockImplementation((args: { where: { email?: string; id?: number } }) =>
    Promise.resolve([admin, gestor].find((u) => u.email === args.where.email || u.id === args.where.id) ?? null),
  );
  db.funcionario.findUnique.mockImplementation((args: { where: { id: number } }) =>
    Promise.resolve(funcionarios.find((f) => f.id === args.where.id) ?? null),
  );
  db.setor.findUnique.mockImplementation((args: { where: { id: number } }) => Promise.resolve({ id: args.where.id, nome: 'S', ativo: true }));
  db.turno.findUnique.mockResolvedValue({ id: 1, nome: 'Noite', horaInicio: '19:00', horaFim: '07:00', cor: '#000000', ativo: true });
  db.plantao.findMany.mockResolvedValue([]);
  db.ausencia.findMany.mockResolvedValue([]);
  db.$transaction.mockImplementation((fn: (tx: typeof db) => unknown) => Promise.resolve(fn(db)));
});

describe('GET /api/escala', () => {
  it('exige inicio e fim', async () => {
    const cookie = await login('admin@x.com');
    const r = await app.inject({ method: 'GET', url: '/api/escala?inicio=2026-10-01T03:00:00Z', headers: { cookie } });
    expect(r.statusCode).toBe(400);
  });

  it('gestor: filtra pelos setores dele e calcula conflitos', async () => {
    const cookie = await login('gestor@x.com');
    const p1 = plantaoCompleto();
    const p2 = plantaoCompleto({ id: 2, inicio: new Date('2026-10-06T20:00:00Z'), fim: new Date('2026-10-07T02:00:00Z') });
    db.plantao.findMany
      .mockResolvedValueOnce([p1, p2]) // listagem
      .mockResolvedValueOnce([p1, p2]); // contexto de conflitos
    db.ausencia.findMany.mockResolvedValueOnce([
      { id: 7, funcionarioId: 3, tipo: 'FOLGA', dataInicio: new Date('2026-10-06T00:00:00Z'), dataFim: new Date('2026-10-06T00:00:00Z') },
    ]);
    const r = await app.inject({
      method: 'GET', url: '/api/escala?inicio=2026-10-01T03:00:00.000Z&fim=2026-11-01T03:00:00.000Z', headers: { cookie },
    });
    expect(r.statusCode).toBe(200);
    const where = db.plantao.findMany.mock.calls[0][0].where;
    expect(where.AND).toContainEqual({ setorId: { in: [10] } });
    expect(where.AND).toContainEqual({ inicio: { lt: new Date('2026-11-01T03:00:00.000Z') } });
    const corpo = r.json();
    expect(corpo[0].conflitos.map((c: { tipo: string }) => c.tipo).sort()).toEqual(['AUSENCIA', 'SOBREPOSICAO']);
    expect(corpo[0].conflitos.find((c: { tipo: string }) => c.tipo === 'SOBREPOSICAO').plantaoId).toBe(2);
    expect(corpo[0]).toMatchObject({ inicio: '2026-10-06T10:00:00.000Z', funcionario: { id: 3, nome: 'Ana' }, turno: { cor: '#3b82f6' } });
  });

  it('gestor filtrando setor alheio → 403', async () => {
    const cookie = await login('gestor@x.com');
    const r = await app.inject({
      method: 'GET', url: '/api/escala?inicio=2026-10-01T03:00:00Z&fim=2026-11-01T03:00:00Z&setorId=99', headers: { cookie },
    });
    expect(r.statusCode).toBe(403);
  });
});

describe('POST/PUT/DELETE /api/escala', () => {
  it('cria manual com setor do funcionário e turno nulo', async () => {
    const cookie = await login('gestor@x.com');
    db.plantao.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(plantaoCompleto({ ...data, id: 5, turno: null })),
    );
    const r = await app.inject({
      method: 'POST', url: '/api/escala', headers: { cookie },
      payload: { funcionarioId: 3, inicio: '2026-10-06T10:00:00.000Z', fim: '2026-10-06T14:00:00.000Z' },
    });
    expect(r.statusCode).toBe(201);
    expect(db.plantao.create.mock.calls[0][0].data).toMatchObject({ setorId: 10, turnoId: null, origem: 'MANUAL', criadoPorId: 2 });
    expect(r.json()).toMatchObject({ id: 5, turno: null, conflitos: [] });
  });

  it('fim <= inicio → 400', async () => {
    const cookie = await login('admin@x.com');
    const r = await app.inject({
      method: 'POST', url: '/api/escala', headers: { cookie },
      payload: { funcionarioId: 3, inicio: '2026-10-06T10:00:00.000Z', fim: '2026-10-06T10:00:00.000Z' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('gestor criando plantão para funcionário de outro setor → 403', async () => {
    const cookie = await login('gestor@x.com');
    const r = await app.inject({
      method: 'POST', url: '/api/escala', headers: { cookie },
      payload: { funcionarioId: 4, inicio: '2026-10-06T10:00:00.000Z', fim: '2026-10-06T14:00:00.000Z' },
    });
    expect(r.statusCode).toBe(403);
    expect(db.plantao.create).not.toHaveBeenCalled();
  });

  it('gestor criando plantão do seu funcionário em setor alheio → 403', async () => {
    const cookie = await login('gestor@x.com');
    const r = await app.inject({
      method: 'POST', url: '/api/escala', headers: { cookie },
      payload: { funcionarioId: 3, setorId: 99, inicio: '2026-10-06T10:00:00.000Z', fim: '2026-10-06T14:00:00.000Z' },
    });
    expect(r.statusCode).toBe(403);
  });

  it('PUT mudando horário apaga lembretes_enviados', async () => {
    const cookie = await login('admin@x.com');
    db.plantao.findUnique.mockResolvedValue({ ...plantaoCompleto(), funcionario: { setorId: 10 } });
    db.plantao.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve(plantaoCompleto({ inicio: data.inicio, fim: data.fim })),
    );
    const r = await app.inject({
      method: 'PUT', url: '/api/escala/1', headers: { cookie },
      payload: { inicio: '2026-10-06T11:00:00.000Z', fim: '2026-10-06T23:00:00.000Z' },
    });
    expect(r.statusCode).toBe(200);
    expect(db.lembreteEnviado.deleteMany).toHaveBeenCalledWith({ where: { escalaId: 1 } });
  });

  it('PUT só de observação não apaga lembretes', async () => {
    const cookie = await login('admin@x.com');
    db.plantao.findUnique.mockResolvedValue({ ...plantaoCompleto(), funcionario: { setorId: 10 } });
    db.plantao.update.mockResolvedValue(plantaoCompleto({ observacao: 'x' }));
    const r = await app.inject({ method: 'PUT', url: '/api/escala/1', headers: { cookie }, payload: { observacao: 'x' } });
    expect(r.statusCode).toBe(200);
    expect(db.lembreteEnviado.deleteMany).not.toHaveBeenCalled();
  });

  it('PUT com fim antes do início (parcial) → 400', async () => {
    const cookie = await login('admin@x.com');
    db.plantao.findUnique.mockResolvedValue({ ...plantaoCompleto(), funcionario: { setorId: 10 } });
    const r = await app.inject({ method: 'PUT', url: '/api/escala/1', headers: { cookie }, payload: { fim: '2026-10-06T09:00:00.000Z' } });
    expect(r.statusCode).toBe(400);
  });

  it('gestor alterando/apagando plantão de outro setor → 403', async () => {
    const cookie = await login('gestor@x.com');
    db.plantao.findUnique.mockResolvedValue({ ...plantaoCompleto({ setorId: 99 }), funcionario: { setorId: 99 } });
    const put = await app.inject({ method: 'PUT', url: '/api/escala/1', headers: { cookie }, payload: { observacao: 'x' } });
    expect(put.statusCode).toBe(403);
    const del = await app.inject({ method: 'DELETE', url: '/api/escala/1', headers: { cookie } });
    expect(del.statusCode).toBe(403);
    expect(db.plantao.delete).not.toHaveBeenCalled();
  });

  it('DELETE inexistente → 404; existente → 204', async () => {
    const cookie = await login('admin@x.com');
    db.plantao.findUnique.mockResolvedValueOnce(null);
    expect((await app.inject({ method: 'DELETE', url: '/api/escala/9', headers: { cookie } })).statusCode).toBe(404);
    db.plantao.findUnique.mockResolvedValueOnce({ ...plantaoCompleto(), funcionario: { setorId: 10 } });
    expect((await app.inject({ method: 'DELETE', url: '/api/escala/1', headers: { cookie } })).statusCode).toBe(204);
  });
});

describe('gerador', () => {
  const entrada = {
    funcionarioIds: [3], padraoId: 1, turnoId: 1, dataInicioCiclo: '2026-10-01',
    periodoInicio: '2026-10-01', periodoFim: '2026-10-31', setorId: null,
  };
  beforeEach(() => {
    db.padraoEscala.findUnique.mockResolvedValue({ id: 1, nome: '12x36', tipo: 'CICLO', diasTrabalho: 1, diasFolga: 1, diasSemana: [], ativo: true });
    db.funcionario.findMany.mockImplementation((args: { where: { id: { in: number[] } } }) =>
      Promise.resolve(funcionarios.filter((f) => args.where.id.in.includes(f.id))),
    );
  });

  it('prévia 12x36 noturno em outubro com conflito de plantão existente', async () => {
    const cookie = await login('gestor@x.com');
    // 01/10 23:00 SP → 02/10 02:00Z..: sobrepõe o primeiro plantão (01/10 19:00 → 02/10 07:00)
    db.plantao.findMany.mockResolvedValue([
      { id: 9, funcionarioId: 3, setorId: 10, inicio: new Date('2026-10-02T02:00:00Z'), fim: new Date('2026-10-02T05:00:00Z') },
    ]);
    const r = await app.inject({ method: 'POST', url: '/api/escala/gerar/previa', headers: { cookie }, payload: entrada });
    expect(r.statusCode).toBe(200);
    const p = r.json();
    expect(p.total).toBe(16);
    expect(p.comConflito).toBe(1);
    expect(p.itens[0]).toMatchObject({
      funcionarioId: 3, funcionarioNome: 'Ana', inicio: '2026-10-01T22:00:00.000Z', fim: '2026-10-02T10:00:00.000Z',
      conflitos: [{ tipo: 'SOBREPOSICAO', plantaoId: 9 }],
    });
    expect(p.itens.at(-1)).toMatchObject({ inicio: '2026-10-31T22:00:00.000Z', fim: '2026-11-01T10:00:00.000Z' });
  });

  it('gestor gerando para funcionário de outro setor → 403', async () => {
    const cookie = await login('gestor@x.com');
    const r = await app.inject({ method: 'POST', url: '/api/escala/gerar/previa', headers: { cookie }, payload: { ...entrada, funcionarioIds: [3, 4] } });
    expect(r.statusCode).toBe(403);
  });

  it('funcionário inativo → 400', async () => {
    const cookie = await login('admin@x.com');
    db.funcionario.findMany.mockResolvedValue([{ ...ana, ativo: false }]);
    const r = await app.inject({ method: 'POST', url: '/api/escala/gerar/previa', headers: { cookie }, payload: entrada });
    expect(r.statusCode).toBe(400);
  });

  it('período maior que 93 dias → 400', async () => {
    const cookie = await login('admin@x.com');
    const r = await app.inject({
      method: 'POST', url: '/api/escala/gerar/previa', headers: { cookie },
      payload: { ...entrada, periodoFim: '2027-01-02' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('SUBSTITUIR apaga sobrepostos e cria; ausência é pulada', async () => {
    const cookie = await login('admin@x.com');
    db.plantao.findMany.mockResolvedValue([
      { id: 9, funcionarioId: 3, setorId: 10, inicio: new Date('2026-10-02T02:00:00Z'), fim: new Date('2026-10-02T05:00:00Z') },
    ]);
    db.ausencia.findMany.mockResolvedValue([
      { id: 1, funcionarioId: 3, tipo: 'FERIAS', dataInicio: new Date('2026-10-10T00:00:00Z'), dataFim: new Date('2026-10-10T00:00:00Z') },
    ]);
    db.plantao.deleteMany.mockResolvedValue({ count: 1 });
    db.plantao.createMany.mockImplementation(({ data }: { data: unknown[] }) => Promise.resolve({ count: data.length }));
    const r = await app.inject({
      method: 'POST', url: '/api/escala/gerar', headers: { cookie }, payload: { ...entrada, modoConflito: 'SUBSTITUIR' },
    });
    expect(r.statusCode).toBe(200);
    // 16 dias; o de 09/10 (19h → 10/10 07h) cai na ausência de 10/10
    expect(r.json()).toEqual({ criados: 15, pulados: 1, substituidos: 1 });
    expect(db.$transaction).toHaveBeenCalled();
    expect(db.plantao.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [9] } } });
    const criado = db.plantao.createMany.mock.calls[0][0].data[0];
    expect(criado).toMatchObject({ funcionarioId: 3, setorId: 10, turnoId: 1, origem: 'GERADO', status: 'AGENDADO', criadoPorId: 1 });
  });

  it('PULAR não apaga nada', async () => {
    const cookie = await login('admin@x.com');
    db.plantao.findMany.mockResolvedValue([
      { id: 9, funcionarioId: 3, setorId: 10, inicio: new Date('2026-10-02T02:00:00Z'), fim: new Date('2026-10-02T05:00:00Z') },
    ]);
    db.plantao.createMany.mockImplementation(({ data }: { data: unknown[] }) => Promise.resolve({ count: data.length }));
    const r = await app.inject({
      method: 'POST', url: '/api/escala/gerar', headers: { cookie }, payload: { ...entrada, modoConflito: 'PULAR' },
    });
    expect(r.json()).toEqual({ criados: 15, pulados: 1, substituidos: 0 });
    expect(db.plantao.deleteMany).not.toHaveBeenCalled();
  });
});

describe('ausências', () => {
  it('GET do gestor filtra por setor e por sobreposição do período', async () => {
    const cookie = await login('gestor@x.com');
    db.ausencia.findMany.mockResolvedValue([
      { id: 1, funcionarioId: 3, tipo: 'FERIAS', dataInicio: new Date('2026-10-10T00:00:00Z'), dataFim: new Date('2026-10-20T00:00:00Z'), observacao: null, funcionario: { id: 3, nome: 'Ana' } },
    ]);
    const r = await app.inject({ method: 'GET', url: '/api/ausencias?inicio=2026-10-01&fim=2026-10-31', headers: { cookie } });
    expect(r.statusCode).toBe(200);
    const and = db.ausencia.findMany.mock.calls[0][0].where.AND;
    expect(and).toContainEqual({ funcionario: { setorId: { in: [10] } } });
    expect(and).toContainEqual({ dataFim: { gte: new Date('2026-10-01T00:00:00Z') } });
    expect(and).toContainEqual({ dataInicio: { lte: new Date('2026-10-31T00:00:00Z') } });
    expect(r.json()[0]).toEqual({
      id: 1, funcionarioId: 3, funcionario: { id: 3, nome: 'Ana' }, tipo: 'FERIAS', dataInicio: '2026-10-10', dataFim: '2026-10-20', observacao: null,
    });
  });

  it('dataFim < dataInicio → 400', async () => {
    const cookie = await login('admin@x.com');
    const r = await app.inject({
      method: 'POST', url: '/api/ausencias', headers: { cookie },
      payload: { funcionarioId: 3, tipo: 'FOLGA', dataInicio: '2026-10-10', dataFim: '2026-10-09' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('gestor criando ausência de funcionário de outro setor → 403', async () => {
    const cookie = await login('gestor@x.com');
    const r = await app.inject({
      method: 'POST', url: '/api/ausencias', headers: { cookie },
      payload: { funcionarioId: 4, tipo: 'FOLGA', dataInicio: '2026-10-10', dataFim: '2026-10-10' },
    });
    expect(r.statusCode).toBe(403);
  });

  it('gestor apagando ausência de outro setor → 403', async () => {
    const cookie = await login('gestor@x.com');
    db.ausencia.findUnique.mockResolvedValue({ id: 1, funcionarioId: 4, funcionario: { setorId: 99 } });
    const r = await app.inject({ method: 'DELETE', url: '/api/ausencias/1', headers: { cookie } });
    expect(r.statusCode).toBe(403);
    expect(db.ausencia.delete).not.toHaveBeenCalled();
  });

  it('cria ausência', async () => {
    const cookie = await login('gestor@x.com');
    db.ausencia.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 2, ...data, funcionario: { id: 3, nome: 'Ana' } }),
    );
    const r = await app.inject({
      method: 'POST', url: '/api/ausencias', headers: { cookie },
      payload: { funcionarioId: 3, tipo: 'ATESTADO', dataInicio: '2026-10-10', dataFim: '2026-10-11', observacao: '  ' },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toMatchObject({ dataInicio: '2026-10-10', dataFim: '2026-10-11', observacao: null });
  });
});

describe('padrões', () => {
  it('gestor lê mas não cria', async () => {
    const cookie = await login('gestor@x.com');
    db.padraoEscala.findMany.mockResolvedValue([]);
    expect((await app.inject({ method: 'GET', url: '/api/padroes?ativo=true', headers: { cookie } })).statusCode).toBe(200);
    expect(db.padraoEscala.findMany.mock.calls[0][0].where).toEqual({ ativo: true });
    const r = await app.inject({ method: 'POST', url: '/api/padroes', headers: { cookie }, payload: { nome: 'X', tipo: 'SEMANAL', diasSemana: [1] } });
    expect(r.statusCode).toBe(403);
  });

  it('valida CICLO e SEMANAL', async () => {
    const cookie = await login('admin@x.com');
    const post = (payload: object) => app.inject({ method: 'POST', url: '/api/padroes', headers: { cookie }, payload });
    expect((await post({ nome: 'X', tipo: 'CICLO', diasTrabalho: 0, diasFolga: 1 })).statusCode).toBe(400);
    expect((await post({ nome: 'X', tipo: 'CICLO', diasTrabalho: 1 })).statusCode).toBe(400);
    expect((await post({ nome: 'X', tipo: 'SEMANAL', diasSemana: [] })).statusCode).toBe(400);
    expect((await post({ nome: 'X', tipo: 'SEMANAL', diasSemana: [7] })).statusCode).toBe(400);
  });

  it('cria SEMANAL normalizando dias e zerando campos de ciclo', async () => {
    const cookie = await login('admin@x.com');
    db.padraoEscala.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 3, ...data }));
    const r = await app.inject({
      method: 'POST', url: '/api/padroes', headers: { cookie },
      payload: { nome: '5x2', tipo: 'SEMANAL', diasTrabalho: 5, diasSemana: [5, 1, 3, 3, 2, 4] },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json()).toEqual({ id: 3, nome: '5x2', tipo: 'SEMANAL', diasTrabalho: null, diasFolga: null, diasSemana: [1, 2, 3, 4, 5], ativo: true });
  });

  it('PUT parcial revalida com os valores atuais', async () => {
    const cookie = await login('admin@x.com');
    db.padraoEscala.findUnique.mockResolvedValue({ id: 1, nome: '12x36', tipo: 'CICLO', diasTrabalho: 1, diasFolga: 1, diasSemana: [], ativo: true });
    db.padraoEscala.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 1, nome: '12x36', tipo: 'CICLO', diasSemana: [], ativo: true, ...data, ...(data.nome === undefined && { nome: '12x36' }), ...(data.ativo === undefined && { ativo: true }) }),
    );
    const r = await app.inject({ method: 'PUT', url: '/api/padroes/1', headers: { cookie }, payload: { ativo: false } });
    expect(r.statusCode).toBe(200);
    expect(db.padraoEscala.update.mock.calls[0][0].data).toMatchObject({ ativo: false, diasTrabalho: 1, diasFolga: 1 });
    const r2 = await app.inject({ method: 'PUT', url: '/api/padroes/1', headers: { cookie }, payload: { tipo: 'SEMANAL' } });
    expect(r2.statusCode).toBe(400);
  });
});
