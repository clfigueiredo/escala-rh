# 6. Fases do projeto

Marque `[x]` ao concluir. Cada fase termina com uma validação combinada com o usuário.

## Fase 0 — Planejamento ✅
- [x] Levantamento de funcionalidades
- [x] Definição de stack e arquitetura
- [x] CLAUDE.md e documentação em `docs/`

## Fase 1 — Infraestrutura ✅
- [x] Fuso do host `America/Sao_Paulo`, atualização de pacotes
- [x] ufw: liberar 22, 80, 443 e ativar
- [x] fail2ban para SSH
- [x] Docker Engine + Compose (repositório oficial)
- [x] `docker-compose.yml`, `.env.example`, geração do `.env` com senhas aleatórias
- [x] Postgres (bases `escala` e `evolution`) e Redis
- [x] Evolution API rodando, respondendo na rede interna
- [x] Caddy com HTTPS válido no domínio (página provisória)
- [x] `scripts/backup.sh` + cron diário + teste de restore

**Validação:** `https://hotspotcontabo.forumtelecom.com.br` abre com cadeado; `docker compose ps` tudo *healthy*; porta 8080/5432 inacessíveis de fora.

## Fase 2 — Base do app ✅
- [x] Projeto `app/` (Fastify + TypeScript + Prisma) e `web/` (React + Vite)
- [x] Schema Prisma + migration inicial + seed (admin, padrões, regra de 1h)
- [x] Login/logout, sessão por cookie, rate limit
- [x] CRUD de usuários (admin) com vínculo de setores
- [x] CRUD de setores, funcionários (com normalização de telefone) e turnos
- [x] Layout do painel e navegação
- [x] `scripts/deploy.sh`

**Validação:** admin loga, cadastra gestor/setor/funcionário/turno; gestor só vê seus setores.

## Fase 3 — Escalas ✅
- [x] CRUD de padrões de escala (ciclo e semanal)
- [x] Gerador com prévia e tratamento de conflitos
- [x] Calendário (semana/mês) com filtros, edição, mover e excluir plantão
- [x] Ausências + sinalização de conflito
- [x] Testes unitários do cálculo de ciclo/semanal e turno que vira a noite

**Validação:** gerar 12x36 e 6x1 para um mês, conferir no calendário, lançar férias e ver conflitos.

## Fase 4 — WhatsApp ✅ (falta validar com o número real)
- [x] Cliente da Evolution no app
- [x] Tela de conexão (QR Code + status), criação automática da instância e webhook
- [x] Tela de regras de lembrete (antecedência/véspera + template com prévia)
- [x] Worker de lembretes com garantia de envio único
- [x] Webhook + bot (menu, 1/2/3, número desconhecido)
- [x] Histórico de mensagens no painel
- [x] Alerta de WhatsApp desconectado

**Validado sem celular (30/09/2026):** QR gerado, webhook configurado, bot 1/2/3/menu com número sem 9º dígito, lembrete disparado na janela e sem duplicar após reiniciar o worker.

**Número real conectado (30/09/2026):** QR lido, instância `open`, mensagem de teste enviada e recebida.
**Bot validado com número real (01/10/2026):** funcionário cadastrado respondeu e recebeu resposta do bot.

**Pendente — validação com o número real:** conectar número dedicado, criar plantão para daqui ~65 min e receber lembrete; consultar 1/2/3 pelo bot.

## Fase 5 — Entrega ✅
- [x] Revisão de segurança (portas, segredos, permissões por setor)
- [x] Backup/restore testado de ponta a ponta
- [x] Revisão dos docs e do CLAUDE.md
- [x] Treinamento rápido / guia de uso para o RH

**Revisão de segurança (30/09/2026) — corrigido:** webhook bloqueado no Caddy e token mascarado nos logs (token trocado); roles do Postgres sem superusuário (`escala_app`, `evolution_app`); senha no Redis; CSP; revogação de sessão (logout/troca de senha); rate limit na troca de senha; proxy confiável só o Caddy; ADMIN_* fora do ambiente do app; healthcheck do worker (heartbeat); 443/udp no ufw.

**Revisão de segurança 2 (30/09/2026) — corrigido:** bot grava/responde só a 1ª mensagem de número desconhecido (texto truncado, limite antes de gravar); bloqueio de login por conta (10 falhas/15 min); limites de tamanho em textos, senha (72 bytes) e listas; erros 4xx/409 sem detalhes internos; índice único `mensagens(evolution_msg_id, direcao)` (migration `0004`). Mantido por decisão do usuário: descrição de conflitos de plantão sem filtro de escopo.

**Pendências de segurança (decisão do usuário):**
- [ ] SSH: desativar login por senha / root com senha (exige cadastrar chave SSH antes)
- [ ] Criptografar os backups antes de qualquer cópia para fora do servidor
- [ ] Trocar a senha do admin inicial pelo painel

## Fase 6 — Evoluções (sob demanda)
Ver lista "Fase 2 (fora do escopo agora)" em `01-visao-geral.md`: confirmação de presença, escala semanal automática, troca de turnos, exportação PDF/Excel, alertas CLT, auditoria.
