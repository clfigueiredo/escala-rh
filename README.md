# Sistema de Escala RH

Sistema web para o RH montar a escala de trabalho dos funcionários e avisar cada pessoa pelo **WhatsApp** antes do turno. O funcionário não acessa o painel: recebe lembretes e consulta a própria escala conversando com um bot no WhatsApp.

## Funcionalidades

- Cadastro de setores, turnos, funcionários e padrões de escala
- Calendário de escala (FullCalendar) com geração automática e detecção de conflitos
- Ausências (férias, folgas, afastamentos)
- Lembretes automáticos por WhatsApp com regras configuráveis (sem envio duplicado)
- Bot de consulta: o funcionário pergunta pelo WhatsApp e recebe a própria escala
- Perfis admin e gestor (gestor só vê os setores vinculados a ele)

## Stack

| Camada | Tecnologia |
|---|---|
| Backend + worker | Node.js 22, TypeScript, Fastify, Prisma |
| Banco | PostgreSQL 16 |
| Painel | React + Vite + FullCalendar |
| WhatsApp | Evolution API v2 + Redis (só rede interna) |
| Proxy/HTTPS | Caddy (Let's Encrypt) |
| Orquestração | Docker Compose |

## Como subir

```bash
cp .env.example .env && chmod 600 .env   # preencher os segredos
./scripts/deploy.sh                       # build do painel + containers + migrations + seed
```

Detalhes em [`docs/`](docs/README.md) — arquitetura, banco, WhatsApp, operação, contrato da API e guia de uso para o RH.

## Estrutura

```
app/       API + worker (Node/TypeScript/Prisma)
web/       painel (React/Vite)
docs/      documentação
infra/     scripts de inicialização do Postgres
scripts/   deploy, backup, restore
```
