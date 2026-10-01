/**
 * /api/regras-lembrete — só ADMIN (docs/08-api.md › Regras de lembrete).
 * ANTECEDENCIA exige `minutos` (horario = null); VESPERA exige `horario` "HH:mm" (minutos = null).
 */
import type { RegraLembrete } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../auth/guards';
import { badRequest, notFound } from '../../lib/erros';
import { prisma } from '../../lib/prisma';
import { dadosExemplo, renderizarTemplate } from '../../lib/template';
import { horaSchema, idParamSchema, textoObrigatorio } from '../../lib/validacao';

const MINUTOS_MAX = 7 * 24 * 60;

const templateSchema = z
  .string({ error: 'Template é obrigatório' })
  .trim()
  .min(1, 'Template é obrigatório')
  .max(2000, 'Template muito longo (máx. 2000 caracteres)');

const camposSchema = z.object({
  nome: textoObrigatorio('Nome').pipe(z.string().max(100, 'Nome muito longo')),
  tipo: z.enum(['ANTECEDENCIA', 'VESPERA'], { error: 'Tipo deve ser ANTECEDENCIA ou VESPERA' }),
  minutos: z
    .number({ error: 'Minutos deve ser um número' })
    .int('Minutos deve ser inteiro')
    .min(1, 'Minutos deve ser ao menos 1')
    .max(MINUTOS_MAX, `Minutos deve ser no máximo ${MINUTOS_MAX} (7 dias)`)
    .nullish(),
  horario: horaSchema.nullish(),
  template: templateSchema,
  ativo: z.boolean().default(true),
});
const atualizarSchema = camposSchema.extend({ ativo: z.boolean().optional() }).partial();

type Campos = z.infer<typeof camposSchema>;

/** Aplica a regra de consistência tipo × minutos/horario. */
function consolidar(c: Campos) {
  if (c.tipo === 'ANTECEDENCIA') {
    if (c.minutos == null) throw badRequest('Informe os minutos de antecedência');
    return { ...c, minutos: c.minutos, horario: null };
  }
  if (!c.horario) throw badRequest('Informe o horário de envio na véspera (HH:mm)');
  return { ...c, horario: c.horario, minutos: null };
}

export function serializarRegra(r: RegraLembrete) {
  return {
    id: r.id,
    nome: r.nome,
    tipo: r.tipo,
    minutos: r.minutos,
    horario: r.horario,
    template: r.template,
    ativo: r.ativo,
  };
}

const plugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAdmin);

  app.get('/', async () => {
    const regras = await prisma.regraLembrete.findMany({ orderBy: { id: 'asc' } });
    return regras.map(serializarRegra);
  });

  app.post('/previa', async (request) => {
    const { template } = z.object({ template: templateSchema }).parse(request.body);
    return { texto: renderizarTemplate(template, dadosExemplo()) };
  });

  app.post('/', async (request, reply) => {
    const dados = consolidar(camposSchema.parse(request.body));
    const r = await prisma.regraLembrete.create({ data: dados });
    return reply.code(201).send(serializarRegra(r));
  });

  app.put('/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const body = atualizarSchema.parse(request.body);
    const atual = await prisma.regraLembrete.findUnique({ where: { id } });
    if (!atual) throw notFound('Regra não encontrada');
    const merged: Campos = {
      nome: body.nome ?? atual.nome,
      tipo: body.tipo ?? atual.tipo,
      minutos: body.minutos !== undefined ? body.minutos : atual.minutos,
      horario: body.horario !== undefined ? body.horario : atual.horario,
      template: body.template ?? atual.template,
      ativo: body.ativo ?? atual.ativo,
    };
    const r = await prisma.regraLembrete.update({ where: { id }, data: consolidar(merged) });
    return serializarRegra(r);
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const atual = await prisma.regraLembrete.findUnique({ where: { id }, select: { id: true } });
    if (!atual) throw notFound('Regra não encontrada');
    await prisma.regraLembrete.delete({ where: { id } });
    return reply.code(204).send();
  });
};

export default plugin;
