/**
 * Schemas zod reutilizáveis. Use `schema.parse(request.body)` nas rotas:
 * um ZodError vira 400 `{ erro, detalhes }` no handler global.
 */
import { z } from 'zod';
import { REGEX_DATA, REGEX_HORA, dataValida } from './datas';

/** `:id` de rota → inteiro positivo. */
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive('id inválido'),
});

/** Query booleana "true"/"false" (ou ausente). */
export const boolQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

/**
 * Senha nova: mínimo 8; máximo 72 bytes, porque o bcrypt ignora o que passa disso
 * (acentos ocupam 2 bytes).
 */
export const senhaNovaSchema = (mensagemMin = 'A senha deve ter ao menos 8 caracteres') =>
  z
    .string()
    .min(8, mensagemMin)
    .refine((s) => Buffer.byteLength(s, 'utf8') <= 72, 'A senha deve ter no máximo 72 caracteres');

/** Inteiro positivo vindo de query string (opcional). */
export const intQuery = z.coerce.number().int().positive().optional();

/** Hora "HH:mm". */
export const horaSchema = z.string().regex(REGEX_HORA, 'Hora deve estar no formato HH:mm');

/** Data "YYYY-MM-DD" existente. */
export const dataSchema = z
  .string()
  .regex(REGEX_DATA, 'Data deve estar no formato YYYY-MM-DD')
  .refine(dataValida, 'Data inválida');

/** Instante ISO 8601 (com fuso) → Date. */
export const instanteSchema = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)) && /T/.test(s), 'Data/hora ISO inválida')
  .transform((s) => new Date(s));

/** Cor "#rrggbb" (normalizada para minúsculas). */
export const corSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Cor deve estar no formato #rrggbb')
  .transform((s) => s.toLowerCase());

/** Tamanhos máximos de texto livre (nomes e observações). */
export const MAX_NOME = 150;
export const MAX_OBSERVACAO = 1000;

/** Texto obrigatório (trim, não vazio, até `max` caracteres). */
export const textoObrigatorio = (campo: string, max = MAX_NOME) =>
  z
    .string({ error: `${campo} é obrigatório` })
    .trim()
    .min(1, `${campo} é obrigatório`)
    .max(max, `${campo} muito longo (máx. ${max})`);

/** Texto opcional: string vazia/whitespace vira null (até MAX_OBSERVACAO caracteres). */
export const textoOpcional = z
  .string()
  .trim()
  .max(MAX_OBSERVACAO, `Texto muito longo (máx. ${MAX_OBSERVACAO})`)
  .nullish()
  .transform((v) => (v ? v : null));
