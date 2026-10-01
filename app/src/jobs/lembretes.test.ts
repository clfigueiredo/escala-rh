/**
 * Worker de lembretes com Prisma em memória (sem banco).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Regra = { id: number; nome: string; tipo: 'ANTECEDENCIA' | 'VESPERA'; minutos: number | null; horario: string | null; template: string; ativo: boolean };
type Func = { id: number; nome: string; telefone: string; ativo: boolean };
type Plantao = { id: number; funcionarioId: number; status: string; inicio: Date; fim: Date; setorId: number; turnoId: number | null };
type Lembrete = { id: number; escalaId: number; regraId: number; status: string; erro?: string | null; mensagemId?: number | null; criadoEm: Date };

const mem = vi.hoisted(() => ({
  regras: [] as Regra[],
  funcionarios: [] as Func[],
  plantoes: [] as Plantao[],
  ausencias: [] as Array<{ funcionarioId: number; tipo: string; dataInicio: Date; dataFim: Date }>,
  lembretes: [] as Lembrete[],
  mensagens: [] as Array<Record<string, unknown>>,
  /** simula outro worker gravando no meio do caminho */
  conflitoEm: new Set<string>(),
}));

vi.mock('../lib/prisma', async () => {
  const { Prisma: P } = await import('@prisma/client');
  const dentro = (v: Date, f: { gt?: Date; gte?: Date; lt?: Date; lte?: Date }) =>
    (!f.gt || v > f.gt) && (!f.gte || v >= f.gte) && (!f.lt || v < f.lt) && (!f.lte || v <= f.lte);
  const p2002 = () => new P.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'teste' });
  return {
    prisma: {
      regraLembrete: { findMany: vi.fn(async () => mem.regras.filter((r) => r.ativo)) },
      plantao: {
        findMany: vi.fn(async ({ where }: { where: { status: string; inicio: object; lembretes: { none: { regraId: number } } } }) =>
          mem.plantoes
            .filter((p) => p.status === where.status && dentro(p.inicio, where.inicio))
            .filter((p) => mem.funcionarios.find((f) => f.id === p.funcionarioId)!.ativo)
            .filter((p) => !mem.lembretes.some((l) => l.escalaId === p.id && l.regraId === where.lembretes.none.regraId))
            .sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
            .map((p) => ({
              ...p,
              funcionario: mem.funcionarios.find((f) => f.id === p.funcionarioId)!,
              setor: { nome: 'Recepção' },
              turno: p.turnoId ? { nome: 'Plantão dia' } : null,
            })),
        ),
      },
      ausencia: {
        findMany: vi.fn(async ({ where }: { where: { funcionarioId: { in: number[] } } }) =>
          mem.ausencias.filter((a) => where.funcionarioId.in.includes(a.funcionarioId)),
        ),
      },
      lembreteEnviado: {
        create: vi.fn(async ({ data }: { data: Omit<Lembrete, 'id' | 'criadoEm'> }) => {
          const k = `${data.escalaId}:${data.regraId}`;
          if (mem.conflitoEm.has(k) || mem.lembretes.some((l) => l.escalaId === data.escalaId && l.regraId === data.regraId)) throw p2002();
          const l = { id: mem.lembretes.length + 1, criadoEm: new Date(), ...data };
          mem.lembretes.push(l);
          return l;
        }),
        update: vi.fn(async ({ where, data }: { where: { id: number }; data: Partial<Lembrete> }) => {
          const l = mem.lembretes.find((x) => x.id === where.id)!;
          Object.assign(l, data);
          return l;
        }),
        updateMany: vi.fn(async ({ where, data }: { where: { status: string; criadoEm: { lt: Date } }; data: Partial<Lembrete> }) => {
          const alvo = mem.lembretes.filter((l) => l.status === where.status && l.criadoEm < where.criadoEm.lt);
          alvo.forEach((l) => Object.assign(l, data));
          return { count: alvo.length };
        }),
      },
      mensagem: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          mem.mensagens.push(data);
          return { id: mem.mensagens.length };
        }),
      },
    },
  };
});

import { combinarDataHora } from '../lib/datas';
import { EvolutionErro } from '../lib/evolution';
import { executarCiclo, filtroInicio } from './lembretes';

const min = 60_000;
const enviar = vi.fn(async (_n: string, _t: string) => ({ id: 'WA-1' }));
const estado = vi.fn(async () => 'open');
const esperar = vi.fn(async (_ms: number) => {});
const deps = { enviar, estado, esperar, intervalo: () => 1500, deveParar: () => false, log: () => {} };

const regraHora: Regra = { id: 1, nome: '1 hora antes', tipo: 'ANTECEDENCIA', minutos: 60, horario: null, template: 'Olá {nome}, {inicio}-{fim} {turno}', ativo: true };
const regraVespera: Regra = { id: 2, nome: 'Véspera', tipo: 'VESPERA', minutos: null, horario: '18:00', template: 'Amanhã {data} às {inicio}', ativo: true };

let pid = 0;
function plantao(inicio: Date, extra: Partial<Plantao> = {}): Plantao {
  const p = { id: ++pid, funcionarioId: 1, status: 'AGENDADO', inicio, fim: new Date(inicio.getTime() + 12 * 60 * min), setorId: 10, turnoId: 1, ...extra };
  mem.plantoes.push(p);
  return p;
}

beforeEach(() => {
  vi.clearAllMocks();
  pid = 0;
  mem.regras = [regraHora];
  mem.funcionarios = [
    { id: 1, nome: 'Maria', telefone: '5551999998888', ativo: true },
    { id: 2, nome: 'Inativo', telefone: '5551977776666', ativo: false },
  ];
  mem.plantoes = [];
  mem.ausencias = [];
  mem.lembretes = [];
  mem.mensagens = [];
  mem.conflitoEm = new Set();
});

describe('filtroInicio', () => {
  const agora = new Date('2026-10-07T12:00:00.000Z'); // 09:00 SP

  it('ANTECEDENCIA: janela (agora-10min+m, agora+m]', () => {
    expect(filtroInicio(regraHora, agora)).toEqual({
      gt: new Date(agora.getTime() + 50 * min),
      lte: new Date(agora.getTime() + 60 * min),
    });
  });

  it('ANTECEDENCIA curta: nunca inclui plantão que já começou (inicio > agora)', () => {
    expect(filtroInicio({ ...regraHora, minutos: 5 }, agora)).toEqual({ gt: agora, lte: new Date(agora.getTime() + 5 * min) });
  });

  it('VESPERA antes do horário → nada', () => {
    expect(filtroInicio(regraVespera, agora)).toBeNull();
  });

  it('VESPERA a partir do horário (SP) → plantões de amanhã (SP)', () => {
    const as18 = combinarDataHora('2026-10-07', '18:00');
    expect(filtroInicio(regraVespera, as18)).toEqual({
      gte: combinarDataHora('2026-10-08', '00:00'),
      lt: combinarDataHora('2026-10-09', '00:00'),
    });
    // 23:30 SP = 02:30 UTC do dia seguinte: "amanhã" continua sendo 08/10
    expect(filtroInicio(regraVespera, combinarDataHora('2026-10-07', '23:30'))).toEqual({
      gte: combinarDataHora('2026-10-08', '00:00'),
      lt: combinarDataHora('2026-10-09', '00:00'),
    });
  });
});

describe('executarCiclo', () => {
  const agora = combinarDataHora('2026-10-07', '06:00');

  it('envia plantão dentro da janela e grava ENVIADO + mensagem LEMBRETE', async () => {
    const p = plantao(combinarDataHora('2026-10-07', '07:00'));
    const r = await executarCiclo(agora, deps);
    expect(r).toMatchObject({ enviados: 1, falhas: 0 });
    expect(enviar).toHaveBeenCalledWith('5551999998888', 'Olá Maria, 07:00-19:00 Plantão dia');
    expect(mem.lembretes).toEqual([expect.objectContaining({ escalaId: p.id, regraId: 1, status: 'ENVIADO', mensagemId: 1 })]);
    expect(mem.mensagens[0]).toMatchObject({ direcao: 'ENVIADA', origem: 'LEMBRETE', status: 'OK', funcionarioId: 1, evolutionMsgId: 'WA-1' });
  });

  it('tolerância de 10 min: recupera atraso de 9 min, não de 11 min', async () => {
    plantao(combinarDataHora('2026-10-07', '06:51')); // lembrete deveria ter saído 05:51 → 9 min atrás
    plantao(combinarDataHora('2026-10-07', '06:49')); // 11 min atrás → fora
    plantao(combinarDataHora('2026-10-07', '07:01')); // ainda não
    const r = await executarCiclo(agora, deps);
    expect(r.enviados).toBe(1);
    expect(mem.lembretes.map((l) => l.escalaId)).toEqual([1]);
  });

  it('não envia duas vezes (2º ciclo não encontra o plantão)', async () => {
    plantao(combinarDataHora('2026-10-07', '07:00'));
    await executarCiclo(agora, deps);
    await executarCiclo(new Date(agora.getTime() + min), deps);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('violação da unique (outro worker) → pula sem enviar', async () => {
    const p = plantao(combinarDataHora('2026-10-07', '07:00'));
    mem.conflitoEm.add(`${p.id}:1`);
    const r = await executarCiclo(agora, deps);
    expect(r).toMatchObject({ enviados: 0, pulados: 1 });
    expect(enviar).not.toHaveBeenCalled();
  });

  it('grava PENDENTE antes de chamar a Evolution', async () => {
    plantao(combinarDataHora('2026-10-07', '07:00'));
    enviar.mockImplementationOnce(async () => {
      expect(mem.lembretes[0]).toMatchObject({ status: 'PENDENTE' });
      return { id: 'X' };
    });
    await executarCiclo(agora, deps);
    expect(mem.lembretes[0].status).toBe('ENVIADO');
  });

  it('plantão dentro de ausência → IGNORADO, sem envio', async () => {
    plantao(combinarDataHora('2026-10-07', '07:00'));
    mem.ausencias = [{ funcionarioId: 1, tipo: 'FERIAS', dataInicio: new Date('2026-10-05T00:00:00Z'), dataFim: new Date('2026-10-07T00:00:00Z') }];
    const r = await executarCiclo(agora, deps);
    expect(r).toMatchObject({ enviados: 0, ignorados: 1 });
    expect(mem.lembretes[0]).toMatchObject({ status: 'IGNORADO' });
    expect(mem.lembretes[0].erro).toContain('férias');
    expect(enviar).not.toHaveBeenCalled();
  });

  it('ignora CANCELADO e funcionário inativo', async () => {
    plantao(combinarDataHora('2026-10-07', '07:00'), { status: 'CANCELADO' });
    plantao(combinarDataHora('2026-10-07', '07:00'), { funcionarioId: 2 });
    const r = await executarCiclo(agora, deps);
    expect(r.enviados).toBe(0);
    expect(mem.lembretes).toHaveLength(0);
  });

  it('VESPERA: às 18:00 lembra os plantões de amanhã (inclusive noturno)', async () => {
    mem.regras = [regraVespera];
    plantao(combinarDataHora('2026-10-08', '07:00'));
    plantao(combinarDataHora('2026-10-08', '19:00'));
    plantao(combinarDataHora('2026-10-09', '07:00')); // depois de amanhã
    expect((await executarCiclo(combinarDataHora('2026-10-07', '17:59'), deps)).enviados).toBe(0);
    const r = await executarCiclo(combinarDataHora('2026-10-07', '18:00'), deps);
    expect(r.enviados).toBe(2);
    expect(enviar.mock.calls.map((c) => c[1])).toEqual(['Amanhã 08/10 às 07:00', 'Amanhã 08/10 às 19:00']);
    expect(esperar).toHaveBeenCalledTimes(1); // intervalo só entre envios
  });

  it('WhatsApp desconectado → FALHOU com erro claro, sem chamar envio', async () => {
    plantao(combinarDataHora('2026-10-07', '07:00'));
    estado.mockResolvedValueOnce('close');
    const r = await executarCiclo(agora, deps);
    expect(r.falhas).toBe(1);
    expect(enviar).not.toHaveBeenCalled();
    expect(mem.lembretes[0]).toMatchObject({ status: 'FALHOU' });
    expect(mem.lembretes[0].erro).toMatch(/WhatsApp desconectado/);
    expect(mem.mensagens[0]).toMatchObject({ status: 'FALHOU' });
  });

  it('instância inexistente → FALHOU', async () => {
    plantao(combinarDataHora('2026-10-07', '07:00'));
    estado.mockRejectedValueOnce(new EvolutionErro('INSTANCIA_INEXISTENTE', 'x', 404));
    await executarCiclo(agora, deps);
    expect(mem.lembretes[0].erro).toMatch(/instância inexistente/);
  });

  it('erro no envio → FALHOU e não é reenviado no ciclo seguinte', async () => {
    plantao(combinarDataHora('2026-10-07', '07:00'));
    enviar.mockRejectedValueOnce(new EvolutionErro('TIMEOUT', 'Evolution API não respondeu em 30 s'));
    await executarCiclo(agora, deps);
    expect(mem.lembretes[0]).toMatchObject({ status: 'FALHOU' });
    expect(mem.lembretes[0].erro).toMatch(/não será reenviada/);
    await executarCiclo(new Date(agora.getTime() + min), deps);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('PENDENTE órfão (worker morreu) vira FALHOU e não é reenviado', async () => {
    const p = plantao(combinarDataHora('2026-10-07', '07:00'));
    mem.lembretes.push({ id: 1, escalaId: p.id, regraId: 1, status: 'PENDENTE', criadoEm: new Date(agora.getTime() - 20 * min) });
    const r = await executarCiclo(agora, deps);
    expect(r.orfaos).toBe(1);
    expect(mem.lembretes[0]).toMatchObject({ status: 'FALHOU' });
    expect(enviar).not.toHaveBeenCalled();
  });

  it('parada solicitada (SIGTERM) interrompe antes do próximo envio', async () => {
    plantao(combinarDataHora('2026-10-07', '07:00'));
    plantao(combinarDataHora('2026-10-07', '07:00'));
    let parar = false;
    enviar.mockImplementationOnce(async () => {
      parar = true;
      return { id: 'A' };
    });
    const r = await executarCiclo(agora, { ...deps, deveParar: () => parar });
    expect(r.enviados).toBe(1);
    expect(mem.lembretes).toHaveLength(1);
  });
});
