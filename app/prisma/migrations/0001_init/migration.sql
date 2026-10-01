-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('ADMIN', 'GESTOR');

-- CreateEnum
CREATE TYPE "TipoPadrao" AS ENUM ('CICLO', 'SEMANAL');

-- CreateEnum
CREATE TYPE "StatusPlantao" AS ENUM ('AGENDADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "OrigemPlantao" AS ENUM ('GERADO', 'MANUAL');

-- CreateEnum
CREATE TYPE "TipoAusencia" AS ENUM ('FERIAS', 'ATESTADO', 'FOLGA', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoRegraLembrete" AS ENUM ('ANTECEDENCIA', 'VESPERA');

-- CreateEnum
CREATE TYPE "StatusLembrete" AS ENUM ('PENDENTE', 'ENVIADO', 'FALHOU', 'IGNORADO');

-- CreateEnum
CREATE TYPE "DirecaoMensagem" AS ENUM ('ENVIADA', 'RECEBIDA');

-- CreateEnum
CREATE TYPE "OrigemMensagem" AS ENUM ('LEMBRETE', 'BOT', 'MANUAL');

-- CreateEnum
CREATE TYPE "StatusMensagem" AS ENUM ('OK', 'FALHOU');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "perfil" "Perfil" NOT NULL DEFAULT 'GESTOR',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_setores" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "setor_id" INTEGER NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuario_setores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setores" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "setores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funcionarios" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "telefone_alt" TEXT,
    "setor_id" INTEGER NOT NULL,
    "cargo" TEXT,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "funcionarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turnos" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "hora_inicio" VARCHAR(5) NOT NULL,
    "hora_fim" VARCHAR(5) NOT NULL,
    "cor" TEXT NOT NULL DEFAULT '#3b82f6',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "turnos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "padroes_escala" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoPadrao" NOT NULL,
    "dias_trabalho" INTEGER,
    "dias_folga" INTEGER,
    "dias_semana" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "padroes_escala_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escala" (
    "id" SERIAL NOT NULL,
    "funcionario_id" INTEGER NOT NULL,
    "setor_id" INTEGER NOT NULL,
    "turno_id" INTEGER,
    "inicio" TIMESTAMPTZ(3) NOT NULL,
    "fim" TIMESTAMPTZ(3) NOT NULL,
    "status" "StatusPlantao" NOT NULL DEFAULT 'AGENDADO',
    "origem" "OrigemPlantao" NOT NULL DEFAULT 'MANUAL',
    "observacao" TEXT,
    "criado_por" INTEGER,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "escala_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ausencias" (
    "id" SERIAL NOT NULL,
    "funcionario_id" INTEGER NOT NULL,
    "tipo" "TipoAusencia" NOT NULL,
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE NOT NULL,
    "observacao" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ausencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regras_lembrete" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoRegraLembrete" NOT NULL,
    "minutos" INTEGER,
    "horario" VARCHAR(5),
    "template" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "regras_lembrete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lembretes_enviados" (
    "id" SERIAL NOT NULL,
    "escala_id" INTEGER NOT NULL,
    "regra_id" INTEGER NOT NULL,
    "status" "StatusLembrete" NOT NULL DEFAULT 'PENDENTE',
    "mensagem_id" INTEGER,
    "erro" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lembretes_enviados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensagens" (
    "id" SERIAL NOT NULL,
    "direcao" "DirecaoMensagem" NOT NULL,
    "telefone" TEXT NOT NULL,
    "funcionario_id" INTEGER,
    "conteudo" TEXT NOT NULL,
    "origem" "OrigemMensagem" NOT NULL,
    "status" "StatusMensagem" NOT NULL DEFAULT 'OK',
    "erro" TEXT,
    "evolution_msg_id" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracoes" (
    "id" SERIAL NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" JSONB NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "configuracoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuario_setores_setor_id_idx" ON "usuario_setores"("setor_id");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_setores_usuario_id_setor_id_key" ON "usuario_setores"("usuario_id", "setor_id");

-- CreateIndex
CREATE UNIQUE INDEX "setores_nome_key" ON "setores"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "funcionarios_telefone_key" ON "funcionarios"("telefone");

-- CreateIndex
CREATE INDEX "funcionarios_telefone_alt_idx" ON "funcionarios"("telefone_alt");

-- CreateIndex
CREATE INDEX "funcionarios_setor_id_idx" ON "funcionarios"("setor_id");

-- CreateIndex
CREATE INDEX "escala_inicio_idx" ON "escala"("inicio");

-- CreateIndex
CREATE INDEX "escala_funcionario_id_inicio_idx" ON "escala"("funcionario_id", "inicio");

-- CreateIndex
CREATE INDEX "escala_setor_id_inicio_idx" ON "escala"("setor_id", "inicio");

-- CreateIndex
CREATE INDEX "ausencias_funcionario_id_data_inicio_idx" ON "ausencias"("funcionario_id", "data_inicio");

-- CreateIndex
CREATE INDEX "lembretes_enviados_regra_id_idx" ON "lembretes_enviados"("regra_id");

-- CreateIndex
CREATE UNIQUE INDEX "lembretes_enviados_escala_id_regra_id_key" ON "lembretes_enviados"("escala_id", "regra_id");

-- CreateIndex
CREATE INDEX "mensagens_criado_em_idx" ON "mensagens"("criado_em");

-- CreateIndex
CREATE INDEX "mensagens_funcionario_id_criado_em_idx" ON "mensagens"("funcionario_id", "criado_em");

-- CreateIndex
CREATE INDEX "mensagens_telefone_idx" ON "mensagens"("telefone");

-- CreateIndex
CREATE UNIQUE INDEX "configuracoes_chave_key" ON "configuracoes"("chave");

-- AddForeignKey
ALTER TABLE "usuario_setores" ADD CONSTRAINT "usuario_setores_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_setores" ADD CONSTRAINT "usuario_setores_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "setores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funcionarios" ADD CONSTRAINT "funcionarios_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "setores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escala" ADD CONSTRAINT "escala_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "funcionarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escala" ADD CONSTRAINT "escala_setor_id_fkey" FOREIGN KEY ("setor_id") REFERENCES "setores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escala" ADD CONSTRAINT "escala_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turnos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escala" ADD CONSTRAINT "escala_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ausencias" ADD CONSTRAINT "ausencias_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "funcionarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lembretes_enviados" ADD CONSTRAINT "lembretes_enviados_escala_id_fkey" FOREIGN KEY ("escala_id") REFERENCES "escala"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lembretes_enviados" ADD CONSTRAINT "lembretes_enviados_regra_id_fkey" FOREIGN KEY ("regra_id") REFERENCES "regras_lembrete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lembretes_enviados" ADD CONSTRAINT "lembretes_enviados_mensagem_id_fkey" FOREIGN KEY ("mensagem_id") REFERENCES "mensagens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_funcionario_id_fkey" FOREIGN KEY ("funcionario_id") REFERENCES "funcionarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

