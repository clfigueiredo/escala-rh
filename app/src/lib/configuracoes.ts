/**
 * Configurações do bot (tabela `configuracoes`, chave → jsonb).
 * Os valores padrão espelham o seed (src/seed.ts) e são usados quando a chave
 * não existe no banco ou está com formato inválido.
 */
import { z } from 'zod';
import { prisma } from './prisma';

export const numeroDesconhecidoSchema = z
  .object({
    acao: z.enum(['ignorar', 'responder'], { error: 'Ação deve ser "ignorar" ou "responder"' }),
    texto: z.string({ error: 'Texto é obrigatório' }).trim().max(2000, 'Texto muito longo (máx. 2000)'),
  })
  .refine((v) => v.acao === 'ignorar' || v.texto.length > 0, {
    message: 'Informe o texto da resposta para números desconhecidos',
    path: ['texto'],
  });

const textoBot = (campo: string) =>
  z.string({ error: `${campo} é obrigatório` }).trim().min(1, `${campo} é obrigatório`).max(2000, `${campo} muito longo (máx. 2000)`);

/** Schema completo (todas as chaves conhecidas). */
export const configuracoesSchema = z.object({
  'bot.menu': textoBot('Menu'),
  'bot.numero_desconhecido': numeroDesconhecidoSchema,
  'bot.sem_turno': textoBot('Texto de "sem turno"'),
});

/** Schema do PUT parcial: só chaves conhecidas (outras → 400). */
export const configuracoesParcialSchema = configuracoesSchema.partial().strict();

export type Configuracoes = z.infer<typeof configuracoesSchema>;
export type ChaveConfiguracao = keyof Configuracoes;
export const CHAVES_CONFIGURACAO = Object.keys(configuracoesSchema.shape) as ChaveConfiguracao[];

export const CONFIGURACOES_PADRAO: Configuracoes = {
  'bot.menu': [
    'Olá! Sou o assistente de escala. 📅',
    'Responda com o número da opção:',
    '',
    '1 — Meu próximo turno',
    '2 — Minha escala dos próximos 7 dias',
    '3 — Minha escala do mês',
  ].join('\n'),
  'bot.numero_desconhecido': {
    acao: 'responder',
    texto:
      'Olá! Este número é da empresa e é usado apenas para avisos de escala aos funcionários. ' +
      'Não respondemos números não cadastrados.',
  },
  'bot.sem_turno': 'Você não tem turnos agendados neste período. 🙂',
};

/** Lê todas as configurações conhecidas, completando com o padrão o que faltar/for inválido. */
export async function lerConfiguracoes(): Promise<Configuracoes> {
  const linhas = await prisma.configuracao.findMany({ where: { chave: { in: CHAVES_CONFIGURACAO } } });
  const out = { ...CONFIGURACOES_PADRAO } as Record<ChaveConfiguracao, unknown>;
  for (const l of linhas) {
    const chave = l.chave as ChaveConfiguracao;
    const r = configuracoesSchema.shape[chave].safeParse(l.valor);
    if (r.success) out[chave] = r.data;
  }
  return out as Configuracoes;
}
