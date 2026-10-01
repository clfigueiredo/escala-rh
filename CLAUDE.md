# CLAUDE.md — Sistema de Escala RH

Sistema web para o RH montar a escala de trabalho dos funcionários e avisar cada pessoa pelo WhatsApp antes do turno. O funcionário **não acessa o painel**: ele recebe lembretes e consulta a própria escala conversando com um bot no WhatsApp.

- **URL:** https://escala.seudominio.com.br (exemplo — domínio e IP reais deste servidor ficam em `CLAUDE.local.md`, fora do git)
- **Servidor:** este mesmo (Ubuntu 24.04, 4 vCPU, 8 GB RAM, IP 203.0.113.10 (exemplo))
- **Ambiente:** servidor de **homologação (testes)**. Versionado com **git** (branch `main`) e espelhado no GitHub **público** (https://github.com/clfigueiredo/escala-rh, remote `origin`). `.env`, `backups/`, `node_modules/`, `dist/` e `everything-claude-code/` ficam fora do git (ver `.gitignore`) — nunca versionar segredos. Antes de alterações arriscadas, faça commit ou backup do banco (`./scripts/backup.sh`).
- **Idioma:** interface, mensagens e documentação em português (pt-BR). Código (nomes de variáveis/funções) pode ser em português quando for termo de domínio (`funcionario`, `escala`, `turno`).

## Documentação

Leia o documento relevante em `docs/` antes de mexer numa área:

| Arquivo | Conteúdo |
|---|---|
| `docs/01-visao-geral.md` | Escopo, funcionalidades, perfis de usuário, o que fica para a fase 2 |
| `docs/02-arquitetura.md` | Componentes, fluxos (lembrete, bot, geração de escala), estrutura de pastas |
| `docs/03-infraestrutura.md` | Docker Compose, Caddy, firewall, variáveis de ambiente, portas |
| `docs/04-banco-de-dados.md` | Modelo de dados completo (tabelas, campos, regras) |
| `docs/05-whatsapp.md` | Evolution API, lembretes, bot de consulta, normalização de telefone |
| `docs/06-fases.md` | Roadmap com checklist de cada fase — **atualize ao concluir itens** |
| `docs/07-operacao.md` | Deploy, logs, backup/restore, troubleshooting |
| `docs/08-api.md` | Contrato da API (rotas, payloads) — referência comum entre `app/` e `web/` |
| `docs/09-guia-rh.md` | Guia de uso do painel para RH e gestores (não técnico) |
| `docs/10-roteiro-tutorial.md` | Roteiro para um Claude Code abrir o painel em produção e escrever o tutorial completo |
| `docs/11-tutorial.md` | Tutorial ilustrado (imagens em `docs/tutorial/img/`) |

Os docs também são exibidos no painel (**Administração › Documentação**, lista em `web/src/lib/documentos.ts`):
ao mudar comportamento, atualize o `.md` — inclusive o tutorial — no mesmo passo.

## Stack

- **Backend + worker:** Node.js 22 LTS, TypeScript, Fastify, Prisma, PostgreSQL 16
- **Frontend (painel):** React + Vite + FullCalendar, servido como estático pelo Caddy
- **WhatsApp:** Evolution API v2 (`evoapicloud/evolution-api`) + Redis
- **Proxy/HTTPS:** Caddy (certificado Let's Encrypt automático)
- **Tudo em Docker Compose**, orquestrado a partir de `/var/www/escala`

## Estrutura de pastas

```
/var/www/escala/
├── CLAUDE.md
├── README.md             # descrição do projeto (página do repositório)
├── .gitignore
├── docs/                 # documentação do projeto
├── docker-compose.yml
├── .env                  # segredos (permissão 600, nunca copiar para fora do servidor) — modelo em .env.example
├── Caddyfile
├── infra/postgres/init/  # script que cria a base `evolution` (só roda com volume vazio)
├── app/                  # API + worker (Node/TypeScript/Prisma) — convenções em app/README.md
├── web/                  # painel (React/Vite)
├── scripts/              # backup.sh, deploy.sh, restore.sh
└── backups/              # dumps diários do Postgres
```

## Regras importantes (não quebrar)

1. **Evolution API nunca fica exposta na internet.** Só na rede interna do Docker; o painel conversa com ela pela API do app. Nada de publicar a porta 8080.
2. **Fuso horário é sempre `America/Sao_Paulo`.** Horários de turno são gravados como `timestamptz`; toda conversão para exibição/mensagem usa esse fuso. Turnos podem atravessar a meia-noite (ex.: 19:00–07:00).
3. **Lembrete nunca é enviado duas vezes.** A tabela `lembretes_enviados` tem chave única `(escala_id, regra_id)`; o worker grava antes/junto do envio. Qualquer mudança no worker precisa manter essa garantia (inclusive se o container reiniciar).
4. **Telefone sempre normalizado** (só dígitos, com DDI 55). Ao identificar quem mandou mensagem, aceitar o número **com e sem o 9º dígito** — ver `docs/05-whatsapp.md`.
5. **Bot só responde a funcionários ativos cadastrados.** Número desconhecido: comportamento definido na configuração (ignorar ou mensagem padrão).
6. **Gestor só enxerga os setores vinculados a ele.** Toda rota de escala/funcionário precisa aplicar esse filtro; admin vê tudo.
7. **Segredos só no `.env`.** Nunca escrever senha/chave em código ou docs.
8. **Escopo enxuto.** Itens marcados como "fase 2" em `docs/01-visao-geral.md` não entram sem o usuário pedir.

## Comandos úteis

```bash
docker compose up -d                 # sobe tudo
docker compose ps                    # status
docker compose logs -f app worker    # logs da aplicação
docker compose exec app npx prisma migrate deploy   # aplica migrations
./scripts/backup.sh                  # backup manual do banco
./scripts/deploy.sh                  # build do painel + rebuild + backup + migrate + seed + restart
cd app && npm test                   # testes do backend (vitest)
grep -E '^ADMIN_(EMAIL|PASSWORD)=' .env   # login do admin inicial (só no servidor)
```

> O seed (rodado no deploy) nunca sobrescreve dados: trocar `ADMIN_PASSWORD` no `.env` depois do primeiro deploy **não** muda a senha do admin — use "Trocar senha" no painel.

## Fluxo de trabalho

- Antes de começar uma fase, confirme com o usuário.
- Ao concluir itens, marque o checklist em `docs/06-fases.md`.
- Mudou estrutura de banco, env, fluxo ou infra? Atualize o doc correspondente no mesmo passo.
