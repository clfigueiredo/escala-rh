-- Versão da sessão do usuário: JWTs com `ver` diferente são rejeitados (revogação de sessão)
ALTER TABLE "usuarios" ADD COLUMN "sessao_versao" INTEGER NOT NULL DEFAULT 0;
