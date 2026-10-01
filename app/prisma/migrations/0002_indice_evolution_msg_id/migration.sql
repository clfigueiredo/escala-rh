-- Índice para deduplicar mensagens recebidas pelo webhook
CREATE INDEX "mensagens_evolution_msg_id_idx" ON "mensagens"("evolution_msg_id");
