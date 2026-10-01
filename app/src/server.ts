/**
 * Entrada da API: node dist/server.js (escuta 0.0.0.0:PORT, padrão 3000).
 */
import { carregarEnv } from './config/env';
import { criarApp } from './app';
import { prisma } from './lib/prisma';

async function main() {
  const env = carregarEnv();
  const app = await criarApp();

  const encerrar = async (sinal: string) => {
    app.log.info(`${sinal} recebido, encerrando...`);
    try {
      await app.close();
      await prisma.$disconnect();
    } finally {
      process.exit(0);
    }
  };
  process.once('SIGTERM', () => void encerrar('SIGTERM'));
  process.once('SIGINT', () => void encerrar('SIGINT'));

  await app.listen({ host: '0.0.0.0', port: env.PORT });
}

main().catch((err) => {
  console.error('Falha ao iniciar a API:', err);
  process.exit(1);
});
