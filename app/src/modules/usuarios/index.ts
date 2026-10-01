/**
 * /api/usuarios — só ADMIN. Sem DELETE: desativar com `ativo: false`.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../auth/guards';
import { gerarHashSenha } from '../../auth/senha';
import { gravarSessao, serializarUsuario } from '../../auth/sessao';
import { badRequest, conflict, notFound } from '../../lib/erros';
import { prisma } from '../../lib/prisma';
import { idParamSchema, senhaNovaSchema, textoObrigatorio } from '../../lib/validacao';

const perfilSchema = z.enum(['ADMIN', 'GESTOR'], { error: 'Perfil deve ser ADMIN ou GESTOR' });
const emailSchema = z.string().trim().toLowerCase().max(254, 'E-mail muito longo').email('E-mail inválido');
const setorIdsSchema = z
  .array(z.number().int().positive())
  .max(500, 'Setores demais')
  .transform((a) => [...new Set(a)]);

const criarSchema = z.object({
  nome: textoObrigatorio('Nome'),
  email: emailSchema,
  senha: senhaNovaSchema(),
  perfil: perfilSchema,
  setorIds: setorIdsSchema.default([]),
  ativo: z.boolean().default(true),
});

const atualizarSchema = z.object({
  nome: textoObrigatorio('Nome').optional(),
  email: emailSchema.optional(),
  // vazio/null = mantém a senha atual
  senha: z
    .union([z.literal(''), z.null(), senhaNovaSchema()])
    .optional(),
  perfil: perfilSchema.optional(),
  setorIds: setorIdsSchema.optional(),
  ativo: z.boolean().optional(),
});

const incluirSetores = { setores: { select: { setorId: true } } } as const;

async function validarSetores(setorIds: number[]) {
  if (setorIds.length === 0) return;
  const n = await prisma.setor.count({ where: { id: { in: setorIds } } });
  if (n !== setorIds.length) throw badRequest('Um ou mais setores não existem');
}

async function assertEmailLivre(email: string, ignorarId?: number) {
  const outro = await prisma.usuario.findUnique({ where: { email } });
  if (outro && outro.id !== ignorarId) throw conflict('Já existe um usuário com este e-mail');
}

const usuarios: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAdmin);

  app.get('/', async () => {
    const lista = await prisma.usuario.findMany({ include: incluirSetores, orderBy: { nome: 'asc' } });
    return lista.map(serializarUsuario);
  });

  app.post('/', async (request, reply) => {
    const d = criarSchema.parse(request.body);
    await assertEmailLivre(d.email);
    await validarSetores(d.setorIds);
    const u = await prisma.usuario.create({
      data: {
        nome: d.nome,
        email: d.email,
        senhaHash: await gerarHashSenha(d.senha),
        perfil: d.perfil,
        ativo: d.ativo,
        setores: { create: d.setorIds.map((setorId) => ({ setorId })) },
      },
      include: incluirSetores,
    });
    return reply.code(201).send(serializarUsuario(u));
  });

  app.put('/:id', async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const d = atualizarSchema.parse(request.body);
    const atual = await prisma.usuario.findUnique({ where: { id } });
    if (!atual) throw notFound('Usuário não encontrado');

    if (id === request.usuario.id) {
      if (d.ativo === false) throw badRequest('Você não pode desativar o seu próprio usuário');
      if (d.perfil && d.perfil !== 'ADMIN') throw badRequest('Você não pode remover o seu próprio perfil de administrador');
    }
    if (d.email) await assertEmailLivre(d.email, id);
    if (d.setorIds) await validarSetores(d.setorIds);

    // Senha, perfil ou desativação mudaram → derruba as sessões abertas desse usuário.
    const revogar =
      !!d.senha ||
      (d.perfil !== undefined && d.perfil !== atual.perfil) ||
      (d.ativo === false && atual.ativo);

    const u = await prisma.$transaction(async (tx) => {
      if (d.setorIds) {
        await tx.usuarioSetor.deleteMany({ where: { usuarioId: id, setorId: { notIn: d.setorIds } } });
        await tx.usuarioSetor.createMany({
          data: d.setorIds.map((setorId) => ({ usuarioId: id, setorId })),
          skipDuplicates: true,
        });
      }
      return tx.usuario.update({
        where: { id },
        data: {
          nome: d.nome,
          email: d.email,
          perfil: d.perfil,
          ativo: d.ativo,
          ...(d.senha ? { senhaHash: await gerarHashSenha(d.senha) } : {}),
          ...(revogar ? { sessaoVersao: { increment: 1 } } : {}),
        },
        include: incluirSetores,
      });
    });
    // Admin alterou a própria senha: mantém a sessão atual com um cookie novo.
    if (revogar && id === request.usuario.id) await gravarSessao(reply, u.id, u.sessaoVersao);
    return serializarUsuario(u);
  });
};

export default usuarios;
