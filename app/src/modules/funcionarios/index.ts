/**
 * /api/funcionarios — com filtro de setor para GESTOR (regra 6).
 * Telefone normalizado (só dígitos, DDI 55) + telefoneAlt (variação do 9º dígito).
 */
import type { FastifyPluginAsync } from 'fastify';
import type { Funcionario, Prisma, Setor } from '@prisma/client';
import { z } from 'zod';
import { assertSetorPermitido, carregarFuncionarioPermitido, podeAcessarSetor, whereSetor } from '../../auth/escopo';
import { requireAuth } from '../../auth/guards';
import type { UsuarioSessao } from '../../auth/tipos';
import { badRequest, conflict } from '../../lib/erros';
import { prisma } from '../../lib/prisma';
import { apenasDigitos, normalizarTelefoneCadastro, variacaoNonoDigito } from '../../lib/telefone';
import { boolQuery, idParamSchema, intQuery, textoObrigatorio, textoOpcional } from '../../lib/validacao';

const criarSchema = z.object({
  nome: textoObrigatorio('Nome'),
  telefone: z.string({ error: 'Telefone é obrigatório' }).min(1, 'Telefone é obrigatório').max(30, 'Telefone inválido'),
  setorId: z.number({ error: 'Setor é obrigatório' }).int().positive(),
  cargo: textoOpcional,
  observacoes: textoOpcional,
  ativo: z.boolean().default(true),
});
const atualizarSchema = z.object({
  nome: textoObrigatorio('Nome').optional(),
  telefone: z.string().min(1, 'Telefone é obrigatório').max(30, 'Telefone inválido').optional(),
  setorId: z.number().int().positive().optional(),
  cargo: textoOpcional.optional(),
  observacoes: textoOpcional.optional(),
  ativo: z.boolean().optional(),
});
const listarSchema = z.object({
  setorId: intQuery,
  ativo: boolQuery,
  busca: z.string().trim().max(100, 'Busca muito longa').optional(),
});

type FuncionarioComSetor = Funcionario & { setor: Pick<Setor, 'id' | 'nome'> };
const incluirSetor = { setor: { select: { id: true, nome: true } } } as const;

export function serializarFuncionario(f: FuncionarioComSetor) {
  return {
    id: f.id,
    nome: f.nome,
    telefone: f.telefone,
    telefoneAlt: f.telefoneAlt,
    setorId: f.setorId,
    setor: { id: f.setor.id, nome: f.setor.nome },
    cargo: f.cargo,
    observacoes: f.observacoes,
    ativo: f.ativo,
  };
}

/**
 * Normaliza o telefone e garante que nenhuma variação já está em uso.
 * Se o funcionário que já usa o número estiver fora do escopo do usuário (gestor de
 * outro setor), o 409 não revela nome nem id.
 */
async function prepararTelefone(usuario: UsuarioSessao, bruto: string, ignorarId?: number) {
  const telefone = normalizarTelefoneCadastro(bruto);
  if (!telefone) {
    throw badRequest('Telefone inválido. Informe DDD + celular com 9 dígitos, ex.: (51) 99999-8888');
  }
  const telefoneAlt = variacaoNonoDigito(telefone);
  const variantes = telefoneAlt ? [telefone, telefoneAlt] : [telefone];
  const outro = await prisma.funcionario.findFirst({
    where: {
      OR: [{ telefone: { in: variantes } }, { telefoneAlt: { in: variantes } }],
      ...(ignorarId ? { NOT: { id: ignorarId } } : {}),
    },
    select: { id: true, nome: true, setorId: true },
  });
  if (outro) {
    if (!podeAcessarSetor(usuario, outro.setorId)) throw conflict('Telefone já cadastrado');
    throw conflict(`Telefone já cadastrado para ${outro.nome}`, { funcionarioId: outro.id });
  }
  return { telefone, telefoneAlt };
}

async function assertSetorExiste(setorId: number) {
  const s = await prisma.setor.findUnique({ where: { id: setorId } });
  if (!s) throw badRequest('Setor não encontrado');
}

const funcionarios: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', requireAuth);

  app.get('/', async (request) => {
    const q = listarSchema.parse(request.query);
    const u = request.usuario;
    if (q.setorId) assertSetorPermitido(u, q.setorId);

    const and: Prisma.FuncionarioWhereInput[] = [whereSetor(u)];
    if (q.setorId) and.push({ setorId: q.setorId });
    if (q.ativo !== undefined) and.push({ ativo: q.ativo });
    if (q.busca) {
      const digitos = apenasDigitos(q.busca);
      const ou: Prisma.FuncionarioWhereInput[] = [{ nome: { contains: q.busca, mode: 'insensitive' } }];
      if (digitos.length >= 3) {
        ou.push({ telefone: { contains: digitos } }, { telefoneAlt: { contains: digitos } });
      }
      and.push({ OR: ou });
    }

    const lista = await prisma.funcionario.findMany({
      where: { AND: and },
      include: incluirSetor,
      orderBy: { nome: 'asc' },
    });
    return lista.map(serializarFuncionario);
  });

  app.get('/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params);
    await carregarFuncionarioPermitido(request.usuario, id, 'leitura');
    const f = await prisma.funcionario.findUniqueOrThrow({ where: { id }, include: incluirSetor });
    return serializarFuncionario(f);
  });

  app.post('/', async (request, reply) => {
    const d = criarSchema.parse(request.body);
    assertSetorPermitido(request.usuario, d.setorId);
    await assertSetorExiste(d.setorId);
    const tel = await prepararTelefone(request.usuario, d.telefone);
    const f = await prisma.funcionario.create({
      data: {
        nome: d.nome,
        ...tel,
        setorId: d.setorId,
        cargo: d.cargo,
        observacoes: d.observacoes,
        ativo: d.ativo,
      },
      include: incluirSetor,
    });
    return reply.code(201).send(serializarFuncionario(f));
  });

  app.put('/:id', async (request) => {
    const { id } = idParamSchema.parse(request.params);
    const d = atualizarSchema.parse(request.body);
    await carregarFuncionarioPermitido(request.usuario, id, 'escrita');
    if (d.setorId !== undefined) {
      assertSetorPermitido(request.usuario, d.setorId);
      await assertSetorExiste(d.setorId);
    }
    const tel = d.telefone !== undefined ? await prepararTelefone(request.usuario, d.telefone, id) : {};
    const f = await prisma.funcionario.update({
      where: { id },
      data: {
        nome: d.nome,
        ...tel,
        setorId: d.setorId,
        cargo: d.cargo,
        observacoes: d.observacoes,
        ativo: d.ativo,
      },
      include: incluirSetor,
    });
    return serializarFuncionario(f);
  });
};

export default funcionarios;
