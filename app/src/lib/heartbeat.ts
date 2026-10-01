/**
 * Heartbeat do worker: arquivo cujo mtime é atualizado ao iniciar e ao fim de cada
 * ciclo (inclusive ciclo pulado por lock de outro worker). O healthcheck do compose
 * considera o worker unhealthy se o mtime passar de 180 s — ciclo travado não grava.
 * /tmp é gravável pelo usuário `node` na imagem (o /app não é).
 */
import { writeFile } from 'node:fs/promises';

export const ARQUIVO_HEARTBEAT = '/tmp/worker-heartbeat';

/** Grava o timestamp ISO no arquivo. Nunca lança (falha só é logada). */
export async function gravarHeartbeat(arquivo = ARQUIVO_HEARTBEAT, agora = new Date()): Promise<boolean> {
  try {
    await writeFile(arquivo, `${agora.toISOString()}\n`);
    return true;
  } catch (err) {
    console.error(`[worker] falha ao gravar heartbeat em ${arquivo}:`, err);
    return false;
  }
}
