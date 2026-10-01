/**
 * Confiança no proxy reverso (Caddy) para X-Forwarded-For.
 *
 * Um salto só: confia apenas no par imediato da conexão (hop 0), e só se ele
 * estiver em rede privada/loopback (rede Docker). Assim `request.ip` = IP que o
 * Caddy anotou; valores extras forjados pelo cliente no X-Forwarded-For são ignorados.
 *
 * Obs.: no Fastify 5 `trustProxy: 1` (contagem de saltos) é tratado como "não confiar
 * em ninguém" — todo mundo viraria o IP do Caddy e o rate limit seria global.
 * Por isso a regra de um salto é implementada como função.
 */
import { BlockList, isIP } from 'node:net';

const privadas = new BlockList();
privadas.addSubnet('127.0.0.0', 8, 'ipv4');
privadas.addSubnet('10.0.0.0', 8, 'ipv4');
privadas.addSubnet('172.16.0.0', 12, 'ipv4');
privadas.addSubnet('192.168.0.0', 16, 'ipv4');
privadas.addAddress('::1', 'ipv6');
privadas.addSubnet('fc00::', 7, 'ipv6');

function privado(endereco: string): boolean {
  const ip = endereco.startsWith('::ffff:') ? endereco.slice(7) : endereco;
  const v = isIP(ip);
  if (v === 4) return privadas.check(ip, 'ipv4');
  if (v === 6) return privadas.check(ip, 'ipv6');
  return false;
}

/** `trustProxy` do Fastify: confia só no salto imediato (Caddy na rede interna). */
export function confiarProxy(endereco: string, salto: number): boolean {
  return salto === 0 && privado(endereco);
}
