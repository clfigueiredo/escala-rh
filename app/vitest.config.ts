import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // TZ=UTC garante que nada depende do fuso do sistema (tudo via luxon/SP).
    env: {
      TZ: 'UTC',
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://teste:teste@localhost:5432/teste',
      JWT_SECRET: 'segredo-de-teste-com-32-caracteres!!',
      ADMIN_EMAIL: 'admin@teste.com.br',
      ADMIN_PASSWORD: 'senha-de-teste',
      EVOLUTION_API_KEY: 'chave-teste',
      WEBHOOK_TOKEN: 'token-de-teste',
    },
  },
});
