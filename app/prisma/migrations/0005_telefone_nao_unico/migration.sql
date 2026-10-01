-- Funcionário inativo não bloqueia mais o telefone: unicidade só entre ativos (verificada na API).
DROP INDEX "funcionarios_telefone_key";
CREATE INDEX "funcionarios_telefone_idx" ON "funcionarios"("telefone");
