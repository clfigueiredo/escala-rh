import { z } from 'zod';

/** Trata variável definida porém vazia (`ADMIN_EMAIL=`) como ausente. */
function vazioParaUndefined<T extends z.ZodType>(s: T) {
  return z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), s);
}

/**
 * Variáveis de ambiente validadas com zod (ver docker-compose.yml). Em
 * desenvolvimento/teste algumas têm valor padrão para não travar ferramentas.
 * ADMIN_EMAIL/ADMIN_PASSWORD são opcionais: só o seed as exige, e só quando
 * precisa criar o admin.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  TZ: z.string().default('America/Sao_Paulo'),
  DOMAIN: z.string().default('localhost'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET deve ter ao menos 16 caracteres'),
  // Só o seed usa (para criar o admin inicial) — app e worker não recebem estas variáveis.
  ADMIN_EMAIL: vazioParaUndefined(z.string().email('ADMIN_EMAIL inválido').optional()),
  ADMIN_PASSWORD: vazioParaUndefined(z.string().min(8, 'ADMIN_PASSWORD deve ter ao menos 8 caracteres').optional()),
  EVOLUTION_URL: z.string().url().default('http://evolution:8080'),
  EVOLUTION_API_KEY: z.string().min(1, 'EVOLUTION_API_KEY é obrigatória'),
  EVOLUTION_INSTANCE: z.string().min(1).default('escala'),
  WEBHOOK_TOKEN: z.string().min(8, 'WEBHOOK_TOKEN deve ter ao menos 8 caracteres'),
});

export type Env = z.infer<typeof schema>;

let cache: Env | undefined;

/** Lê e valida o ambiente (uma vez). Encerra o processo com mensagem clara se inválido. */
export function carregarEnv(): Env {
  if (cache) return cache;
  const r = schema.safeParse(process.env);
  if (!r.success) {
    const lista = r.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    console.error(`Variáveis de ambiente inválidas:\n${lista}`);
    process.exit(1);
  }
  cache = r.data;
  return cache;
}

/** Ambiente validado (lazy: só valida no primeiro acesso). */
export const env: Env = new Proxy({} as Env, {
  get(_t, prop) {
    return carregarEnv()[prop as keyof Env];
  },
});
