-- Deduplicação de mensagens no banco: a mesma mensagem da Evolution (key.id) não pode
-- ser gravada duas vezes na mesma direção (corrida entre retentativas do webhook).
-- NULLs continuam permitidos (mensagens sem id).
DROP INDEX IF EXISTS "mensagens_evolution_msg_id_idx";
CREATE UNIQUE INDEX "mensagens_evolution_msg_id_direcao_key" ON "mensagens"("evolution_msg_id", "direcao");
