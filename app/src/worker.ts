/**
 * Entrada do worker: node dist/worker.js.
 * Roda os jobs a cada minuto (alinhado ao início do minuto), sem sobreposição,
 * com encerramento limpo em SIGTERM/SIGINT (espera o ciclo em andamento terminar).
 * Dono a partir da onda 2: agente WHATSAPP.
 *
 * Um ciclo nunca roda em paralelo com outro: o próximo só é agendado quando o atual
 * termina (se demorar mais de 1 min, o minuto seguinte é pulado). Entre workers, o job
 * usa pg_try_advisory_xact_lock. Em SIGTERM, o envio em curso termina e o laço para.
 *
 * Heartbeat: /tmp/worker-heartbeat (lib/heartbeat.ts) é atualizado ao iniciar e ao fim
 * de cada ciclo — usado pelo healthcheck do compose (mtime > 180 s = travado).
 */
import { carregarEnv } from './config/env';
import { processarLembretes, solicitarParada } from './jobs/lembretes';
import { gravarHeartbeat } from './lib/heartbeat';
import { prisma } from './lib/prisma';

const INTERVALO_MS = 60_000;

let encerrando = false;
let timer: NodeJS.Timeout | undefined;
let cicloAtual: Promise<void> | undefined;

function log(msg: string, extra?: unknown) {
  const linha = `[worker] ${new Date().toISOString()} ${msg}`;
  if (extra !== undefined) console.log(linha, extra);
  else console.log(linha);
}

async function ciclo(): Promise<void> {
  const agora = new Date();
  try {
    await processarLembretes(agora);
  } catch (err) {
    console.error('[worker] erro no ciclo de lembretes:', err);
  } finally {
    // ciclo terminou (ok, com erro ou pulado por lock): o laço está vivo
    await gravarHeartbeat();
  }
}

function agendarProximo() {
  if (encerrando) return;
  const espera = INTERVALO_MS - (Date.now() % INTERVALO_MS) + 500; // meio segundo após virar o minuto
  timer = setTimeout(async () => {
    cicloAtual = ciclo();
    await cicloAtual;
    cicloAtual = undefined;
    agendarProximo();
  }, espera);
}

async function encerrar(sinal: string) {
  if (encerrando) return;
  encerrando = true;
  solicitarParada();
  log(`${sinal} recebido, encerrando...`);
  if (timer) clearTimeout(timer);
  try {
    if (cicloAtual) await cicloAtual;
    await prisma.$disconnect();
  } finally {
    log('worker encerrado');
    process.exit(0);
  }
}

async function main() {
  carregarEnv();
  process.once('SIGTERM', () => void encerrar('SIGTERM'));
  process.once('SIGINT', () => void encerrar('SIGINT'));
  await gravarHeartbeat();
  log('worker iniciado');
  cicloAtual = ciclo();
  await cicloAtual;
  cicloAtual = undefined;
  agendarProximo();
}

main().catch((err) => {
  console.error('[worker] falha ao iniciar:', err);
  process.exit(1);
});
