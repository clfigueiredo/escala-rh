/**
 * Seed idempotente: node dist/seed.js
 * Cria somente o que não existe (não sobrescreve alterações feitas no painel).
 */
import { carregarEnv } from './config/env';
import { gerarHashSenha } from './auth/senha';
import { prisma } from './lib/prisma';

export const TEMPLATE_LEMBRETE_PADRAO = [
  'Olá {nome}! 👋',
  'Lembrete: seu turno começa hoje às {inicio} (até {fim}) no setor {setor}.',
  'Bom trabalho!',
].join('\n');

export const CONFIGURACOES_PADRAO: Record<string, unknown> = {
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

async function main() {
  const env = carregarEnv();
  const log = (m: string) => console.log(`[seed] ${m}`);

  // Admin inicial — ADMIN_EMAIL/ADMIN_PASSWORD só são exigidos se for preciso criá-lo
  // (passe via `docker compose run --rm -e ADMIN_EMAIL=... -e ADMIN_PASSWORD=... app node dist/seed.js`).
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const admin = email
    ? await prisma.usuario.findUnique({ where: { email } })
    : await prisma.usuario.findFirst({ where: { perfil: 'ADMIN' }, orderBy: { id: 'asc' } });
  if (!admin) {
    if (!email || !env.ADMIN_PASSWORD) {
      throw new Error(
        email
          ? `admin ${email} não existe e ADMIN_PASSWORD não foi informada — passe ADMIN_PASSWORD (mín. 8 caracteres) para criá-lo`
          : 'nenhum administrador cadastrado — informe ADMIN_EMAIL e ADMIN_PASSWORD para criar o admin inicial',
      );
    }
    await prisma.usuario.create({
      data: {
        nome: 'Administrador',
        email,
        senhaHash: await gerarHashSenha(env.ADMIN_PASSWORD),
        perfil: 'ADMIN',
        ativo: true,
      },
    });
    log(`admin criado: ${email}`);
  } else {
    log(`admin já existe: ${admin.email}`);
  }

  // Padrões de escala
  const padroes = [
    { nome: '12x36', tipo: 'CICLO' as const, diasTrabalho: 1, diasFolga: 1, diasSemana: [] },
    { nome: '6x1', tipo: 'CICLO' as const, diasTrabalho: 6, diasFolga: 1, diasSemana: [] },
    { nome: '5x2', tipo: 'SEMANAL' as const, diasTrabalho: null, diasFolga: null, diasSemana: [1, 2, 3, 4, 5] },
  ];
  for (const p of padroes) {
    const existe = await prisma.padraoEscala.findFirst({ where: { nome: p.nome } });
    if (!existe) {
      await prisma.padraoEscala.create({ data: { ...p, ativo: true } });
      log(`padrão criado: ${p.nome}`);
    }
  }

  // Regra de lembrete
  const nomeRegra = '1 hora antes';
  if (!(await prisma.regraLembrete.findFirst({ where: { nome: nomeRegra } }))) {
    await prisma.regraLembrete.create({
      data: { nome: nomeRegra, tipo: 'ANTECEDENCIA', minutos: 60, template: TEMPLATE_LEMBRETE_PADRAO, ativo: true },
    });
    log(`regra de lembrete criada: ${nomeRegra}`);
  }

  // Configurações (só cria chaves ausentes)
  for (const [chave, valor] of Object.entries(CONFIGURACOES_PADRAO)) {
    const r = await prisma.configuracao.upsert({
      where: { chave },
      create: { chave, valor: valor as object },
      update: {},
    });
    if (r.criadoEm.getTime() === r.atualizadoEm.getTime()) log(`configuração garantida: ${chave}`);
  }

  log('concluído');
}

main()
  .catch((err) => {
    console.error('[seed] falhou:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
