/**
 * Job de lembretes — executado pelo worker a cada minuto (algoritmo em docs/05-whatsapp.md).
 *
 * GARANTIA DE ENVIO ÚNICO (regra 3 do CLAUDE.md):
 * - Antes de enviar, grava `lembretes_enviados (escala_id, regra_id)` como PENDENTE.
 *   Violação da chave única (P2002) = outro ciclo/worker já cuidou → pula.
 * - Só depois envia e atualiza para ENVIADO/FALHOU (+ registro em `mensagens`, origem LEMBRETE).
 * - Um PENDENTE que sobrou (container morreu no meio do envio) NUNCA é reenviado: após
 *   15 min vira FALHOU com a explicação — preferimos não enviar a enviar duas vezes.
 * - Timeout no envio também vira FALHOU (pode ter sido entregue; não reenvia).
 *
 * Execução: um ciclo por vez (o worker só agenda o próximo quando o atual termina) e
 * `pg_try_advisory_xact_lock` para o caso de existirem 2 workers.
 */
import { Prisma, type RegraLembrete, type TipoAusencia } from '@prisma/client';
import {
  dataDoDb,
  dataParaDb,
  fimDoDiaExclusivo,
  formatarHora,
  inicioDoDia,
  paraDataSP,
  somarDias,
} from '../lib/datas';
import { EvolutionErro, descreverErro, enviarTexto, estadoConexao } from '../lib/evolution';
import { prisma } from '../lib/prisma';
import { renderizarTemplate } from '../lib/template';

/** Tolerância: recupera envios se o worker ficou parado por pouco tempo. */
export const TOLERANCIA_MS = 10 * 60_000;
/** PENDENTE mais velho que isso é considerado interrompido. */
export const PENDENTE_ORFAO_MS = 15 * 60_000;
/** Chave do advisory lock (constante arbitrária do projeto). */
const CHAVE_LOCK = 734_501_001;

export interface DependenciasLembretes {
  enviar: (numero: string, texto: string) => Promise<{ id: string | null }>;
  /** Estado da conexão; lança EvolutionErro (ex.: INSTANCIA_INEXISTENTE). */
  estado: () => Promise<string>;
  esperar: (ms: number) => Promise<void>;
  /** Intervalo entre envios (ms). */
  intervalo: () => number;
  deveParar: () => boolean;
  log: (msg: string) => void;
}

let paradaSolicitada = false;
/** Chamado pelo worker em SIGTERM: termina o envio atual e não começa outro. */
export function solicitarParada(): void {
  paradaSolicitada = true;
}

const depsPadrao: DependenciasLembretes = {
  enviar: enviarTexto,
  estado: () => estadoConexao(),
  esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
  intervalo: () => 1000 + Math.floor(Math.random() * 2000),
  deveParar: () => paradaSolicitada,
  log: (msg) => console.log(`[lembretes] ${new Date().toISOString()} ${msg}`),
};

export interface ResumoCiclo {
  enviados: number;
  falhas: number;
  ignorados: number;
  pulados: number;
  orfaos: number;
}

/**
 * Filtro de `inicio` dos plantões que a regra deve lembrar agora.
 * - ANTECEDENCIA m: `inicio - m ∈ (agora - 10min, agora]` e `inicio > agora`.
 * - VESPERA hh:mm: se hora atual (SP) >= hh:mm → plantões que começam amanhã (SP).
 * @returns null se a regra não tem nada a fazer agora.
 */
export function filtroInicio(
  regra: Pick<RegraLembrete, 'tipo' | 'minutos' | 'horario'>,
  agora: Date,
): Prisma.DateTimeFilter | null {
  if (regra.tipo === 'ANTECEDENCIA') {
    if (!regra.minutos || regra.minutos < 1) return null;
    const m = regra.minutos * 60_000;
    const de = new Date(Math.max(agora.getTime() - TOLERANCIA_MS + m, agora.getTime()));
    return { gt: de, lte: new Date(agora.getTime() + m) };
  }
  if (!regra.horario || formatarHora(agora) < regra.horario) return null;
  const amanha = somarDias(paraDataSP(agora), 1);
  return { gte: inicioDoDia(amanha), lt: fimDoDiaExclusivo(amanha) };
}

function ehUnicaViolada(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

const ROTULO_AUSENCIA: Record<TipoAusencia, string> = {
  FERIAS: 'férias',
  ATESTADO: 'atestado',
  FOLGA: 'folga',
  OUTRO: 'ausência',
};

interface AusenciaSimples {
  funcionarioId: number;
  tipo: TipoAusencia;
  dataInicio: string;
  dataFim: string;
}

/** Ausência que cobre a data (SP) do início do plantão, se houver. */
export function ausenciaDoPlantao(
  funcionarioId: number,
  inicio: Date,
  ausencias: AusenciaSimples[],
): AusenciaSimples | undefined {
  const d = paraDataSP(inicio);
  return ausencias.find((a) => a.funcionarioId === funcionarioId && a.dataInicio <= d && d <= a.dataFim);
}

/** Marca como FALHOU os PENDENTE antigos (envio interrompido) — sem reenviar. */
async function fecharPendentesOrfaos(agora: Date): Promise<number> {
  const r = await prisma.lembreteEnviado.updateMany({
    where: { status: 'PENDENTE', criadoEm: { lt: new Date(agora.getTime() - PENDENTE_ORFAO_MS) } },
    data: {
      status: 'FALHOU',
      erro: 'Envio interrompido (worker reiniciado durante o envio). Não confirmado; não será reenviado automaticamente.',
    },
  });
  return r.count;
}

/** Um ciclo completo, sem lock (testável). */
export async function executarCiclo(agora: Date, deps: DependenciasLembretes = depsPadrao): Promise<ResumoCiclo> {
  const resumo: ResumoCiclo = { enviados: 0, falhas: 0, ignorados: 0, pulados: 0, orfaos: 0 };
  resumo.orfaos = await fecharPendentesOrfaos(agora);

  const regras = await prisma.regraLembrete.findMany({ where: { ativo: true }, orderBy: { id: 'asc' } });

  // 1) seleção dos plantões por regra
  const candidatos = [];
  for (const regra of regras) {
    const filtro = filtroInicio(regra, agora);
    if (!filtro) continue;
    const plantoes = await prisma.plantao.findMany({
      where: {
        status: 'AGENDADO',
        inicio: filtro,
        funcionario: { ativo: true },
        lembretes: { none: { regraId: regra.id } },
      },
      orderBy: { inicio: 'asc' },
      include: {
        funcionario: { select: { id: true, nome: true, telefone: true, ativo: true } },
        setor: { select: { nome: true } },
        turno: { select: { nome: true } },
      },
    });
    for (const p of plantoes) {
      if (!p.funcionario.ativo || !p.funcionario.telefone) continue;
      candidatos.push({ regra, plantao: p });
    }
  }
  if (!candidatos.length) return resumo;

  // 2) ausências → IGNORADO
  const datas = candidatos.map((c) => paraDataSP(c.plantao.inicio)).sort();
  const ausenciasDb = await prisma.ausencia.findMany({
    where: {
      funcionarioId: { in: [...new Set(candidatos.map((c) => c.plantao.funcionarioId))] },
      dataInicio: { lte: dataParaDb(datas[datas.length - 1]) },
      dataFim: { gte: dataParaDb(datas[0]) },
    },
  });
  const ausencias: AusenciaSimples[] = ausenciasDb.map((a) => ({
    funcionarioId: a.funcionarioId,
    tipo: a.tipo,
    dataInicio: dataDoDb(a.dataInicio),
    dataFim: dataDoDb(a.dataFim),
  }));

  const envios = [];
  for (const c of candidatos) {
    const aus = ausenciaDoPlantao(c.plantao.funcionarioId, c.plantao.inicio, ausencias);
    if (!aus) {
      envios.push(c);
      continue;
    }
    try {
      await prisma.lembreteEnviado.create({
        data: {
          escalaId: c.plantao.id,
          regraId: c.regra.id,
          status: 'IGNORADO',
          erro: `Plantão dentro de ausência (${ROTULO_AUSENCIA[aus.tipo]} de ${aus.dataInicio} a ${aus.dataFim})`,
        },
      });
      resumo.ignorados++;
    } catch (err) {
      if (ehUnicaViolada(err)) resumo.pulados++;
      else throw err;
    }
  }
  envios.sort((a, b) => a.plantao.inicio.getTime() - b.plantao.inicio.getTime());

  // 3) envio
  let estadoWpp: string | undefined;
  let erroConexao = '';
  for (let i = 0; i < envios.length; i++) {
    if (deps.deveParar()) {
      deps.log('parada solicitada — restante fica para o próximo ciclo');
      break;
    }
    const { regra, plantao } = envios[i];

    // Reserva ANTES de enviar (regra 3). Conflito = já tratado → pula.
    let registroId: number;
    try {
      registroId = (
        await prisma.lembreteEnviado.create({
          data: { escalaId: plantao.id, regraId: regra.id, status: 'PENDENTE' },
          select: { id: true },
        })
      ).id;
    } catch (err) {
      if (ehUnicaViolada(err)) {
        resumo.pulados++;
        continue;
      }
      throw err;
    }

    const texto = renderizarTemplate(regra.template, {
      nome: plantao.funcionario.nome,
      inicio: plantao.inicio,
      fim: plantao.fim,
      turno: plantao.turno?.nome ?? null,
      setor: plantao.setor.nome,
    });

    if (estadoWpp === undefined) {
      try {
        estadoWpp = await deps.estado();
        if (estadoWpp !== 'open') erroConexao = `WhatsApp desconectado (estado: ${estadoWpp}). Conecte o número na tela Conexão.`;
      } catch (err) {
        estadoWpp = 'erro';
        erroConexao =
          err instanceof EvolutionErro && err.tipo === 'INSTANCIA_INEXISTENTE'
            ? 'WhatsApp não configurado: instância inexistente. Conecte o número na tela Conexão.'
            : `WhatsApp indisponível: ${descreverErro(err)}`;
      }
    }

    let ok = false;
    let erro: string | null = null;
    let evolutionMsgId: string | null = null;
    let tentouEnviar = false;
    if (estadoWpp !== 'open') {
      erro = erroConexao;
    } else {
      tentouEnviar = true;
      try {
        evolutionMsgId = (await deps.enviar(plantao.funcionario.telefone, texto)).id;
        ok = true;
      } catch (err) {
        erro = descreverErro(err);
        if (err instanceof EvolutionErro && err.tipo === 'TIMEOUT') {
          erro += ' — a mensagem pode ter sido entregue; não será reenviada automaticamente.';
        }
        if (err instanceof EvolutionErro && err.tipo === 'NAO_CONECTADO') {
          estadoWpp = 'close';
          erroConexao = err.message;
        }
      }
    }

    const mensagem = await prisma.mensagem.create({
      data: {
        direcao: 'ENVIADA',
        telefone: plantao.funcionario.telefone,
        funcionarioId: plantao.funcionario.id,
        conteudo: texto,
        origem: 'LEMBRETE',
        status: ok ? 'OK' : 'FALHOU',
        erro,
        evolutionMsgId,
      },
      select: { id: true },
    });
    await prisma.lembreteEnviado.update({
      where: { id: registroId },
      data: { status: ok ? 'ENVIADO' : 'FALHOU', erro, mensagemId: mensagem.id },
    });
    if (ok) resumo.enviados++;
    else resumo.falhas++;

    const restamEnvios = envios.slice(i + 1).length > 0;
    if (tentouEnviar && restamEnvios && estadoWpp === 'open') await deps.esperar(deps.intervalo());
  }

  if (resumo.enviados || resumo.falhas || resumo.ignorados || resumo.orfaos) {
    deps.log(
      `ciclo: ${resumo.enviados} enviado(s), ${resumo.falhas} falha(s), ${resumo.ignorados} ignorado(s) por ausência` +
        (resumo.pulados ? `, ${resumo.pulados} já tratado(s)` : '') +
        (resumo.orfaos ? `, ${resumo.orfaos} pendente(s) interrompido(s) marcados como FALHOU` : '') +
        (erroConexao && resumo.falhas ? ` — ${erroConexao}` : ''),
    );
  }
  return resumo;
}

/**
 * Entrada do worker. Usa advisory lock transacional para que, havendo 2 workers,
 * só um processe o ciclo (a unique de lembretes_enviados continua sendo a garantia final).
 * @returns resumo, ou null se outro worker está com o lock.
 */
export async function processarLembretes(
  agora: Date,
  deps: DependenciasLembretes = depsPadrao,
): Promise<ResumoCiclo | null> {
  return prisma.$transaction(
    async (tx) => {
      const r = await tx.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_xact_lock(${CHAVE_LOCK}::bigint) AS ok`;
      if (!r[0]?.ok) {
        deps.log('outro worker está processando lembretes — ciclo pulado');
        return null;
      }
      return executarCiclo(agora, deps);
    },
    { maxWait: 10_000, timeout: 30 * 60_000 },
  );
}
