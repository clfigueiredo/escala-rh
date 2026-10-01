/**
 * /api/configuracoes — só ADMIN (docs/08-api.md › Configurações).
 * GET → objeto chave→valor completo; PUT parcial (só chaves conhecidas) → objeto completo atualizado.
 */
import type { FastifyPluginAsync } from 'fastify';
import { requireAdmin } from '../../auth/guards';
import { configuracoesParcialSchema, lerConfiguracoes } from '../../lib/configuracoes';
import { prisma } from '../../lib/prisma';

const plugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAdmin);

  app.get('/', async () => lerConfiguracoes());

  app.put('/', async (request) => {
    const parcial = configuracoesParcialSchema.parse(request.body ?? {});
    const entradas = Object.entries(parcial).filter(([, v]) => v !== undefined);
    if (entradas.length) {
      await prisma.$transaction(
        entradas.map(([chave, valor]) =>
          prisma.configuracao.upsert({
            where: { chave },
            create: { chave, valor: valor as object },
            update: { valor: valor as object },
          }),
        ),
      );
    }
    return lerConfiguracoes();
  });
};

export default plugin;
