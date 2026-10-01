/**
 * Bloqueio de login por conta (complementa o limite por IP do @fastify/rate-limit):
 * muitas senhas erradas para o mesmo e-mail, vindas de qualquer IP, bloqueiam novas
 * tentativas desse e-mail por um tempo. Em memória — zera ao reiniciar o container.
 */

export const MAX_FALHAS_POR_CONTA = 10;
export const JANELA_FALHAS_MS = 15 * 60_000;
export const DURACAO_BLOQUEIO_MS = 15 * 60_000;

interface Registro {
  falhas: number;
  inicio: number;
  bloqueadoAte: number;
}

const registros = new Map<string, Registro>();

/** Milissegundos restantes de bloqueio do e-mail (0 = liberado). */
export function bloqueioRestante(email: string, agoraMs = Date.now()): number {
  const r = registros.get(email);
  return r && r.bloqueadoAte > agoraMs ? r.bloqueadoAte - agoraMs : 0;
}

/** Conta uma senha errada; ao atingir o limite dentro da janela, bloqueia o e-mail. */
export function registrarFalha(email: string, agoraMs = Date.now()): void {
  let r = registros.get(email);
  if (!r || agoraMs - r.inicio > JANELA_FALHAS_MS) {
    r = { falhas: 0, inicio: agoraMs, bloqueadoAte: 0 };
    registros.set(email, r);
  }
  r.falhas += 1;
  if (r.falhas >= MAX_FALHAS_POR_CONTA) {
    r.bloqueadoAte = agoraMs + DURACAO_BLOQUEIO_MS;
    r.falhas = 0;
    r.inicio = agoraMs;
  }
  if (registros.size > 5000) {
    for (const [k, v] of registros) {
      if (v.bloqueadoAte <= agoraMs && agoraMs - v.inicio > JANELA_FALHAS_MS) registros.delete(k);
    }
  }
}

/** Login bem-sucedido zera as falhas do e-mail. */
export function limparFalhas(email: string): void {
  registros.delete(email);
}

/** Só para testes. */
export function limparBloqueios(): void {
  registros.clear();
}
