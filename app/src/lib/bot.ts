/**
 * Bot de consulta pelo WhatsApp (docs/05-whatsapp.md).
 *
 * '1' → próximo turno · '2' → hoje até +7 dias · '3' → hoje até +30 dias · outro → menu.
 * Só responde a funcionário ATIVO (regra 5); número desconhecido/inativo segue
 * `bot.numero_desconhecido` — só o 1º contato do número é gravado/respondido. Ausências do período aparecem na resposta; plantões que
 * caem dentro de uma ausência não são listados (não serão trabalhados).
 * Limite: 1 resposta a cada 3 s por número (em memória).
 */
import { Prisma, type Funcionario, type TipoAusencia } from '@prisma/client';
import { lerConfiguracoes } from './configuracoes';
import {
  dataDoDb,
  dataParaDb,
  diaSemanaCurto,
  diaSemanaExtenso,
  fimDoDiaExclusivo,
  formatarData,
  formatarHora,
  inicioDoDia,
  paraDataSP,
  somarDias,
} from './datas';
import { descreverErro, enviarTexto } from './evolution';
import { prisma } from './prisma';
import { variantesTelefone } from './telefone';

export type OpcaoBot = '1' | '2' | '3';

export interface PlantaoBot {
  inicio: Date;
  fim: Date;
  setor: string;
  turno: string | null;
}

export interface AusenciaBot {
  tipo: TipoAusencia;
  /** "YYYY-MM-DD" */
  dataInicio: string;
  /** "YYYY-MM-DD" (inclusiva) */
  dataFim: string;
  observacao: string | null;
}

const ROTULO_AUSENCIA: Record<TipoAusencia, string> = {
  FERIAS: 'Férias',
  ATESTADO: 'Atestado',
  FOLGA: 'Folga',
  OUTRO: 'Ausência',
};

/** '1', '2' ou '3' (aceita espaços, pontuação e emoji numérico "1️⃣"); senão null → menu. */
export function interpretarOpcao(texto: string): OpcaoBot | null {
  const t = (texto ?? '').trim().replace(/️|⃣/g, '');
  const m = /^([123])[\s.)\-!]*$/.exec(t);
  return m ? (m[1] as OpcaoBot) : null;
}

/** "Seg 06/10 — 07:00 às 19:00 (Recepção)" */
export function formatarLinhaPlantao(p: PlantaoBot): string {
  return `${diaSemanaCurto(p.inicio)} ${formatarData(p.inicio)} — ${formatarHora(p.inicio)} às ${formatarHora(p.fim)} (${p.setor})`;
}

function ddmm(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

/** "12/10 a 20/10 — Férias" / "15/10 — Folga" */
export function formatarLinhaAusencia(a: AusenciaBot): string {
  const periodo = a.dataInicio === a.dataFim ? ddmm(a.dataInicio) : `${ddmm(a.dataInicio)} a ${ddmm(a.dataFim)}`;
  const rotulo = a.tipo === 'OUTRO' && a.observacao ? a.observacao : ROTULO_AUSENCIA[a.tipo];
  return `${periodo} — ${rotulo}`;
}

function blocoAusencias(ausencias: AusenciaBot[]): string {
  if (!ausencias.length) return '';
  return `\n\n🏖️ Ausências no período\n${ausencias.map(formatarLinhaAusencia).join('\n')}`;
}

/** true se a data (SP) do início do plantão está dentro de alguma ausência. */
export function plantaoEmAusencia(inicio: Date, ausencias: AusenciaBot[]): boolean {
  const d = paraDataSP(inicio);
  return ausencias.some((a) => a.dataInicio <= d && d <= a.dataFim);
}

/** Texto da opção 1. */
export function textoProximoTurno(p: PlantaoBot | null, ausencias: AusenciaBot[], semTurno: string): string {
  if (!p) return semTurno + blocoAusencias(ausencias);
  const dia = diaSemanaExtenso(p.inicio);
  const linhas = [
    '📅 Seu próximo turno',
    `${dia.charAt(0).toUpperCase()}${dia.slice(1)}, ${formatarData(p.inicio)} — ${formatarHora(p.inicio)} às ${formatarHora(p.fim)}`,
    `Setor: ${p.setor}${p.turno ? ` (${p.turno})` : ''}`,
  ];
  return linhas.join('\n') + blocoAusencias(ausencias);
}

/** Texto das opções 2 e 3 (lista). */
export function textoLista(titulo: string, plantoes: PlantaoBot[], ausencias: AusenciaBot[], semTurno: string): string {
  if (!plantoes.length) return semTurno + blocoAusencias(ausencias);
  return `📅 ${titulo}\n${plantoes.map(formatarLinhaPlantao).join('\n')}` + blocoAusencias(ausencias);
}

/** Período (datas SP, inclusivas) e título de cada opção de lista. */
export function periodoOpcao(opcao: '2' | '3', agora: Date): { dataInicio: string; dataFim: string; titulo: string } {
  const hoje = paraDataSP(agora);
  if (opcao === '2') {
    return { dataInicio: hoje, dataFim: somarDias(hoje, 7), titulo: 'Sua escala — próximos 7 dias' };
  }
  // Janela móvel (não o mês do calendário): no fim do mês já mostra o mês seguinte.
  return { dataInicio: hoje, dataFim: somarDias(hoje, 30), titulo: 'Sua escala — próximos 30 dias' };
}

async function buscarAusencias(funcionarioId: number, dataInicio: string, dataFim: string): Promise<AusenciaBot[]> {
  const lista = await prisma.ausencia.findMany({
    where: {
      funcionarioId,
      dataInicio: { lte: dataParaDb(dataFim) },
      dataFim: { gte: dataParaDb(dataInicio) },
    },
    orderBy: { dataInicio: 'asc' },
  });
  return lista.map((a) => ({
    tipo: a.tipo,
    dataInicio: dataDoDb(a.dataInicio),
    dataFim: dataDoDb(a.dataFim),
    observacao: a.observacao,
  }));
}

const incluirPlantao = {
  setor: { select: { nome: true } },
  turno: { select: { nome: true } },
} as const;

function paraPlantaoBot(p: { inicio: Date; fim: Date; setor: { nome: string }; turno: { nome: string } | null }): PlantaoBot {
  return { inicio: p.inicio, fim: p.fim, setor: p.setor.nome, turno: p.turno?.nome ?? null };
}

/** Monta a resposta para uma opção (consulta o banco). */
export async function montarResposta(funcionarioId: number, opcao: OpcaoBot, agora: Date, semTurno: string): Promise<string> {
  if (opcao === '1') {
    const hoje = paraDataSP(agora);
    const candidatos = await prisma.plantao.findMany({
      where: { funcionarioId, status: 'AGENDADO', inicio: { gt: agora } },
      orderBy: { inicio: 'asc' },
      take: 60,
      include: incluirPlantao,
    });
    // ausências de hoje em diante (para filtrar plantões e mostrar as do período)
    const fimBusca = candidatos.length ? paraDataSP(candidatos[candidatos.length - 1].inicio) : somarDias(hoje, 30);
    const ausencias = await buscarAusencias(funcionarioId, hoje, fimBusca > hoje ? fimBusca : hoje);
    const proximo = candidatos.find((p) => !plantaoEmAusencia(p.inicio, ausencias)) ?? null;
    const ateData = proximo ? paraDataSP(proximo.inicio) : somarDias(hoje, 30);
    const doPeriodo = ausencias.filter((a) => a.dataInicio <= ateData && a.dataFim >= hoje);
    return textoProximoTurno(proximo ? paraPlantaoBot(proximo) : null, doPeriodo, semTurno);
  }

  const { dataInicio, dataFim, titulo } = periodoOpcao(opcao, agora);
  const [plantoes, ausencias] = await Promise.all([
    prisma.plantao.findMany({
      where: {
        funcionarioId,
        status: 'AGENDADO',
        inicio: { gte: inicioDoDia(dataInicio), lt: fimDoDiaExclusivo(dataFim) },
      },
      orderBy: { inicio: 'asc' },
      include: incluirPlantao,
    }),
    buscarAusencias(funcionarioId, dataInicio, dataFim),
  ]);
  const lista = plantoes.filter((p) => !plantaoEmAusencia(p.inicio, ausencias)).map(paraPlantaoBot);
  return textoLista(titulo, lista, ausencias, semTurno);
}

// ---------------------------------------------------------------------------
// Rate limit (1 resposta / 3 s por número)
// ---------------------------------------------------------------------------

export const INTERVALO_MINIMO_RESPOSTA_MS = 3_000;
const ultimaResposta = new Map<string, number>();

/** Registra e informa se pode responder agora a este número. */
export function podeResponder(telefone: string, agoraMs = Date.now()): boolean {
  const ultima = ultimaResposta.get(telefone);
  if (ultima !== undefined && agoraMs - ultima < INTERVALO_MINIMO_RESPOSTA_MS) return false;
  ultimaResposta.set(telefone, agoraMs);
  if (ultimaResposta.size > 5000) {
    for (const [k, v] of ultimaResposta) if (agoraMs - v > 60_000) ultimaResposta.delete(k);
  }
  return true;
}

/** Só para testes. */
export function limparRateLimit(): void {
  ultimaResposta.clear();
}

// ---------------------------------------------------------------------------
// Processamento de mensagem recebida
// ---------------------------------------------------------------------------

export interface MensagemRecebida {
  /** Telefone normalizado (só dígitos com 55). */
  telefone: string;
  texto: string;
  /** key.id da mensagem no WhatsApp */
  msgId: string | null;
}

export type ResultadoBot =
  | { acao: 'duplicada' }
  | { acao: 'ignorada'; motivo: string }
  | { acao: 'limitada' }
  | { acao: 'respondida'; texto: string; ok: boolean };

export interface DependenciasBot {
  enviar: (numero: string, texto: string) => Promise<{ id: string | null }>;
  agora: () => Date;
}

const depsPadrao: DependenciasBot = { enviar: enviarTexto, agora: () => new Date() };

/** Procura funcionário pelo telefone recebido (com e sem 9º dígito). Ativos têm prioridade. */
export async function buscarFuncionarioPorTelefone(telefone: string): Promise<Funcionario | null> {
  const variantes = variantesTelefone(telefone);
  if (!variantes.length) return null;
  const lista = await prisma.funcionario.findMany({
    where: { OR: [{ telefone: { in: variantes } }, { telefoneAlt: { in: variantes } }] },
    orderBy: [{ ativo: 'desc' }, { id: 'asc' }],
    take: 2,
  });
  return lista[0] ?? null;
}

/** Texto recebido é truncado antes de gravar (WhatsApp aceita até ~64 KB). */
export const TAMANHO_MAX_MENSAGEM = 1000;

function truncar(texto: string): string {
  return texto.length > TAMANHO_MAX_MENSAGEM ? `${texto.slice(0, TAMANHO_MAX_MENSAGEM)}…` : texto;
}

/** Grava a RECEBIDA; `false` se a mensagem já existia (retentativa da Evolution). */
async function registrarRecebida(msg: MensagemRecebida, funcionarioId: number | null): Promise<boolean> {
  try {
    await prisma.mensagem.create({
      data: {
        direcao: 'RECEBIDA',
        telefone: msg.telefone,
        funcionarioId,
        conteudo: truncar(msg.texto),
        origem: 'BOT',
        status: 'OK',
        evolutionMsgId: msg.msgId,
      },
    });
    return true;
  } catch (err) {
    // Chave única (evolution_msg_id, direcao): mesma mensagem processada em paralelo.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
    throw err;
  }
}

export async function processarMensagemRecebida(
  msg: MensagemRecebida,
  deps: DependenciasBot = depsPadrao,
): Promise<ResultadoBot> {
  // Retentativa da Evolution: mesma mensagem já registrada → não responde de novo.
  if (msg.msgId) {
    const ja = await prisma.mensagem.findFirst({
      where: { evolutionMsgId: msg.msgId, direcao: 'RECEBIDA' },
      select: { id: true },
    });
    if (ja) return { acao: 'duplicada' };
  }

  const funcionario = await buscarFuncionarioPorTelefone(msg.telefone);
  const config = await lerConfiguracoes();
  let resposta: string;

  if (!funcionario?.ativo) {
    // Número desconhecido/inativo: só o 1º contato é gravado (e respondido, se
    // configurado). Mensagens seguintes do mesmo número são ignoradas sem gravar.
    const motivo = funcionario ? 'funcionário inativo' : 'número desconhecido';
    const contatoAnterior = await prisma.mensagem.findFirst({
      where: { direcao: 'RECEBIDA', telefone: { in: variantesTelefone(msg.telefone) } },
      select: { id: true },
    });
    if (contatoAnterior) return { acao: 'ignorada', motivo: `${motivo} (já avisado)` };
    if (!(await registrarRecebida(msg, funcionario?.id ?? null))) return { acao: 'duplicada' };
    const nd = config['bot.numero_desconhecido'];
    if (nd.acao !== 'responder' || !nd.texto) return { acao: 'ignorada', motivo };
    resposta = nd.texto;
    if (!podeResponder(msg.telefone)) return { acao: 'limitada' };
  } else {
    // Limite antes de gravar: flood de um mesmo número não enche a tabela.
    if (!podeResponder(msg.telefone)) return { acao: 'limitada' };
    if (!(await registrarRecebida(msg, funcionario.id))) return { acao: 'duplicada' };
    const opcao = interpretarOpcao(msg.texto);
    resposta = opcao
      ? await montarResposta(funcionario.id, opcao, deps.agora(), config['bot.sem_turno'])
      : config['bot.menu'];
  }

  let ok = true;
  let erro: string | null = null;
  let evolutionMsgId: string | null = null;
  try {
    evolutionMsgId = (await deps.enviar(msg.telefone, resposta)).id;
  } catch (err) {
    ok = false;
    erro = descreverErro(err);
  }

  await prisma.mensagem.create({
    data: {
      direcao: 'ENVIADA',
      telefone: msg.telefone,
      funcionarioId: funcionario?.id ?? null,
      conteudo: resposta,
      origem: 'BOT',
      status: ok ? 'OK' : 'FALHOU',
      erro,
      evolutionMsgId,
    },
  });

  return { acao: 'respondida', texto: resposta, ok };
}
