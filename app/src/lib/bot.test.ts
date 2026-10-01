/**
 * Bot de consulta com Prisma em memória (sem banco).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Plantao = { id: number; funcionarioId: number; status: string; inicio: Date; fim: Date; setor: { nome: string }; turno: { nome: string } | null };
type Ausencia = { funcionarioId: number; tipo: string; dataInicio: Date; dataFim: Date; observacao: string | null };

const mem = vi.hoisted(() => ({
  funcionarios: [] as Array<{ id: number; nome: string; telefone: string; telefoneAlt: string | null; ativo: boolean; setorId: number }>,
  plantoes: [] as Plantao[],
  ausencias: [] as Ausencia[],
  mensagens: [] as Array<Record<string, unknown>>,
  config: [] as Array<{ chave: string; valor: unknown }>,
}));

vi.mock('./prisma', () => {
  const filtraData = (v: Date, f?: { gt?: Date; gte?: Date; lt?: Date; lte?: Date }) =>
    !f || ((!f.gt || v > f.gt) && (!f.gte || v >= f.gte) && (!f.lt || v < f.lt) && (!f.lte || v <= f.lte));
  return {
    prisma: {
      funcionario: {
        findMany: vi.fn(async ({ where }: { where: { OR: Array<{ telefone?: { in: string[] }; telefoneAlt?: { in: string[] } }> } }) => {
          const vs = where.OR.flatMap((o) => o.telefone?.in ?? o.telefoneAlt?.in ?? []);
          return mem.funcionarios
            .filter((f) => vs.includes(f.telefone) || (f.telefoneAlt !== null && vs.includes(f.telefoneAlt)))
            .sort((a, b) => Number(b.ativo) - Number(a.ativo));
        }),
      },
      mensagem: {
        findFirst: vi.fn(
          async ({ where }: { where: { evolutionMsgId?: string; direcao: string; telefone?: { in: string[] } } }) =>
            mem.mensagens.find(
              (m) =>
                m.direcao === where.direcao &&
                (where.evolutionMsgId === undefined || m.evolutionMsgId === where.evolutionMsgId) &&
                (where.telefone === undefined || where.telefone.in.includes(m.telefone as string)),
            ) ?? null,
        ),
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          mem.mensagens.push(data);
          return { id: mem.mensagens.length, ...data };
        }),
      },
      configuracao: { findMany: vi.fn(async () => mem.config) },
      plantao: {
        findMany: vi.fn(async ({ where, take }: { where: { funcionarioId: number; status: string; inicio: { gt?: Date; gte?: Date; lt?: Date } }; take?: number }) => {
          const l = mem.plantoes
            .filter((p) => p.funcionarioId === where.funcionarioId && p.status === where.status && filtraData(p.inicio, where.inicio))
            .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
          return take ? l.slice(0, take) : l;
        }),
      },
      ausencia: {
        findMany: vi.fn(async ({ where }: { where: { funcionarioId: number; dataInicio: { lte: Date }; dataFim: { gte: Date } } }) =>
          mem.ausencias.filter(
            (a) => a.funcionarioId === where.funcionarioId && a.dataInicio <= where.dataInicio.lte && a.dataFim >= where.dataFim.gte,
          ),
        ),
      },
    },
  };
});

import { Prisma } from '@prisma/client';
import { TAMANHO_MAX_MENSAGEM, interpretarOpcao, limparRateLimit, podeResponder, processarMensagemRecebida } from './bot';
import { CONFIGURACOES_PADRAO } from './configuracoes';
import { combinarDataHora } from './datas';

// "agora" = qua 07/10/2026 10:00 SP
const AGORA = combinarDataHora('2026-10-07', '10:00');
const enviar = vi.fn(async (_n: string, _t: string) => ({ id: 'OUT-1' }));
const deps = { enviar, agora: () => AGORA };

function plantao(id: number, data: string, ini: string, fim: string, extra: Partial<Plantao> = {}): Plantao {
  const dataFim = fim <= ini ? new Date(combinarDataHora(data, fim).getTime() + 86_400_000) : combinarDataHora(data, fim);
  return { id, funcionarioId: 1, status: 'AGENDADO', inicio: combinarDataHora(data, ini), fim: dataFim, setor: { nome: 'Recepção' }, turno: { nome: 'Plantão dia' }, ...extra };
}

let seq = 0;
async function receber(texto: string, telefone = '5551999998888') {
  limparRateLimit();
  return processarMensagemRecebida({ telefone, texto, msgId: `IN-${++seq}` }, deps);
}

beforeEach(() => {
  vi.clearAllMocks();
  limparRateLimit();
  mem.funcionarios = [{ id: 1, nome: 'Maria', telefone: '5551999998888', telefoneAlt: '555199998888', ativo: true, setorId: 10 }];
  mem.plantoes = [
    plantao(1, '2026-10-05', '07:00', '19:00'), // passado (mês corrente)
    plantao(2, '2026-10-08', '07:00', '19:00'),
    plantao(3, '2026-10-10', '19:00', '07:00', { setor: { nome: 'UTI' } }), // vira a noite
    plantao(4, '2026-10-13', '07:00', '19:00'), // dentro de férias
    plantao(5, '2026-10-20', '07:00', '19:00'),
    plantao(6, '2026-11-02', '07:00', '19:00'),
    plantao(7, '2026-10-09', '07:00', '19:00', { status: 'CANCELADO' }),
  ];
  mem.ausencias = [
    { funcionarioId: 1, tipo: 'FERIAS', dataInicio: new Date('2026-10-12T00:00:00Z'), dataFim: new Date('2026-10-16T00:00:00Z'), observacao: null },
  ];
  mem.mensagens = [];
  mem.config = [];
});

describe('interpretarOpcao', () => {
  it.each([
    ['1', '1'], [' 2 ', '2'], ['3.', '3'], ['1️⃣', '1'], ['oi', null], ['12', null], ['menu', null], ['', null],
  ])('%j → %j', (t, esperado) => {
    expect(interpretarOpcao(t)).toBe(esperado);
  });
});

describe('bot — funcionário ativo', () => {
  it("'1' → próximo turno", async () => {
    const r = await receber('1');
    expect(r).toEqual({
      acao: 'respondida',
      ok: true,
      texto: '📅 Seu próximo turno\nQuinta-feira, 08/10 — 07:00 às 19:00\nSetor: Recepção (Plantão dia)',
    });
    expect(enviar).toHaveBeenCalledWith('5551999998888', expect.any(String));
  });

  it("'2' → hoje até +7 dias, sem cancelado nem plantão em férias, com ausências", async () => {
    const r = await receber('2');
    expect(r.acao === 'respondida' && r.texto).toBe(
      [
        '📅 Sua escala — próximos 7 dias',
        'Qui 08/10 — 07:00 às 19:00 (Recepção)',
        'Sáb 10/10 — 19:00 às 07:00 (UTI)',
        '',
        '🏖️ Ausências no período',
        '12/10 a 16/10 — Férias',
      ].join('\n'),
    );
  });

  it("'3' → mês corrente (inclui dias já passados do mês)", async () => {
    const r = await receber('3');
    expect(r.acao === 'respondida' && r.texto).toBe(
      [
        '📅 Sua escala — outubro/2026',
        'Seg 05/10 — 07:00 às 19:00 (Recepção)',
        'Qui 08/10 — 07:00 às 19:00 (Recepção)',
        'Sáb 10/10 — 19:00 às 07:00 (UTI)',
        'Ter 20/10 — 07:00 às 19:00 (Recepção)',
        '',
        '🏖️ Ausências no período',
        '12/10 a 16/10 — Férias',
      ].join('\n'),
    );
  });

  it('outro texto → menu', async () => {
    const r = await receber('bom dia');
    expect(r.acao === 'respondida' && r.texto).toBe(CONFIGURACOES_PADRAO['bot.menu']);
  });

  it('sem turno no período → bot.sem_turno (configurável)', async () => {
    mem.plantoes = [];
    mem.ausencias = [];
    mem.config = [{ chave: 'bot.sem_turno', valor: 'Nada por aqui.' }];
    const r = await receber('2');
    expect(r.acao === 'respondida' && r.texto).toBe('Nada por aqui.');
  });

  it('registra RECEBIDA e ENVIADA (origem BOT)', async () => {
    await receber('1');
    expect(mem.mensagens).toHaveLength(2);
    expect(mem.mensagens[0]).toMatchObject({ direcao: 'RECEBIDA', origem: 'BOT', funcionarioId: 1, conteudo: '1' });
    expect(mem.mensagens[1]).toMatchObject({ direcao: 'ENVIADA', origem: 'BOT', funcionarioId: 1, status: 'OK', evolutionMsgId: 'OUT-1' });
  });

  it('9º dígito: mensagem chega sem o 9 e acha o funcionário', async () => {
    const r = await receber('1', '555199998888');
    expect(r.acao).toBe('respondida');
    expect(mem.mensagens[0]).toMatchObject({ funcionarioId: 1 });
  });

  it('9º dígito: cadastro sem o 9 e mensagem chega com o 9', async () => {
    mem.funcionarios = [{ id: 1, nome: 'Maria', telefone: '555199998888', telefoneAlt: '5551999998888', ativo: true, setorId: 10 }];
    const r = await receber('menu', '5551999998888');
    expect(r.acao).toBe('respondida');
  });

  it('falha no envio → ENVIADA com status FALHOU', async () => {
    enviar.mockRejectedValueOnce(new Error('WhatsApp desconectado'));
    const r = await receber('1');
    expect(r).toMatchObject({ acao: 'respondida', ok: false });
    expect(mem.mensagens[1]).toMatchObject({ status: 'FALHOU', erro: 'WhatsApp desconectado' });
  });

  it('mensagem repetida (retentativa da Evolution) não responde de novo', async () => {
    await processarMensagemRecebida({ telefone: '5551999998888', texto: '1', msgId: 'DUP' }, deps);
    limparRateLimit();
    const r = await processarMensagemRecebida({ telefone: '5551999998888', texto: '1', msgId: 'DUP' }, deps);
    expect(r).toEqual({ acao: 'duplicada' });
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('rate limit: 2ª mensagem em menos de 3 s não é respondida', async () => {
    await processarMensagemRecebida({ telefone: '5551999998888', texto: '1', msgId: 'R1' }, deps);
    const r = await processarMensagemRecebida({ telefone: '5551999998888', texto: '2', msgId: 'R2' }, deps);
    expect(r).toEqual({ acao: 'limitada' });
    expect(enviar).toHaveBeenCalledTimes(1);
    // mensagem limitada não é gravada (flood não enche a tabela)
    expect(mem.mensagens.filter((m) => m.direcao === 'RECEBIDA')).toHaveLength(1);
  });

  it('corrida: chave única do banco (P2002) → duplicada, sem responder', async () => {
    const { prisma } = await import('./prisma');
    vi.mocked(prisma.mensagem.create).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'teste' }),
    );
    const r = await receber('1');
    expect(r).toEqual({ acao: 'duplicada' });
    expect(enviar).not.toHaveBeenCalled();
  });
});

describe('bot — número desconhecido / inativo', () => {
  it('padrão (responder): 1ª mensagem é registrada e recebe o aviso padrão', async () => {
    const r = await receber('1', '5511988887777');
    expect(r).toMatchObject({ acao: 'respondida', texto: CONFIGURACOES_PADRAO['bot.numero_desconhecido'].texto });
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(mem.mensagens).toEqual([
      expect.objectContaining({ direcao: 'RECEBIDA', funcionarioId: null }),
      expect.objectContaining({ direcao: 'ENVIADA', funcionarioId: null }),
    ]);
  });

  it('2ª mensagem do mesmo número desconhecido é ignorada sem gravar', async () => {
    await receber('oi', '5511988887777');
    const r = await receber('alô?', '5511988887777');
    expect(r).toEqual({ acao: 'ignorada', motivo: 'número desconhecido (já avisado)' });
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(mem.mensagens).toHaveLength(2);
  });

  it('2ª mensagem chegando sem o 9º dígito também é ignorada', async () => {
    await receber('oi', '5511988887777');
    const r = await receber('oi', '551188887777');
    expect(r).toMatchObject({ acao: 'ignorada' });
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it('configurado para ignorar: grava só a 1ª e não responde', async () => {
    mem.config = [{ chave: 'bot.numero_desconhecido', valor: { acao: 'ignorar', texto: '' } }];
    const r = await receber('1', '5511988887777');
    expect(r).toEqual({ acao: 'ignorada', motivo: 'número desconhecido' });
    await receber('2', '5511988887777');
    expect(enviar).not.toHaveBeenCalled();
    expect(mem.mensagens).toEqual([expect.objectContaining({ direcao: 'RECEBIDA', funcionarioId: null })]);
  });

  it('funcionário inativo é tratado como desconhecido', async () => {
    mem.funcionarios[0].ativo = false;
    const r = await receber('1');
    expect(r).toMatchObject({ acao: 'respondida', texto: CONFIGURACOES_PADRAO['bot.numero_desconhecido'].texto });
    const r2 = await receber('1');
    expect(r2).toEqual({ acao: 'ignorada', motivo: 'funcionário inativo (já avisado)' });
  });

  it('texto recebido longo é truncado ao gravar', async () => {
    await receber('x'.repeat(5000), '5511988887777');
    expect((mem.mensagens[0].conteudo as string).length).toBe(TAMANHO_MAX_MENSAGEM + 1);
  });
});

describe('podeResponder', () => {
  it('1 resposta a cada 3 s por número', () => {
    limparRateLimit();
    expect(podeResponder('a', 1000)).toBe(true);
    expect(podeResponder('a', 3999)).toBe(false);
    expect(podeResponder('b', 3999)).toBe(true);
    expect(podeResponder('a', 4000)).toBe(true);
  });
});
