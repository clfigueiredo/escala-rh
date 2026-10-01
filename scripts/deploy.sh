#!/usr/bin/env bash
# Deploy de nova versão (homologação):
#   1. build do painel (web/ -> web/dist) com o node do host
#   2. build da imagem do app/worker
#   3. backup do banco
#   4. roles do Postgres (db-roles.sh, idempotente) + prisma migrate deploy (como escala_app)
#   5. seed (idempotente; ADMIN_EMAIL/ADMIN_PASSWORD só neste passo)
#   6. docker compose up -d (+ restart do caddy para enxergar o novo web/dist)
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"
export PATH="/usr/local/bin:$PATH"

log() { echo -e "\n==> $*"; }

[[ -f .env ]] || { echo "Arquivo .env não encontrado em $DIR" >&2; exit 1; }
[[ -f app/Dockerfile ]] || { echo "app/Dockerfile não encontrado" >&2; exit 1; }
[[ -f web/package.json ]] || { echo "web/package.json não encontrado" >&2; exit 1; }

log "Build do painel (node $(node -v))"
( cd web && npm ci && npm run build )
[[ -f web/dist/index.html ]] || { echo "Build do painel não gerou web/dist/index.html" >&2; exit 1; }

log "Build da imagem app/worker"
docker compose build app worker

log "Subindo infraestrutura (postgres, redis, evolution, caddy)"
docker compose up -d postgres redis evolution caddy

log "Backup antes da migração"
./scripts/backup.sh || echo "AVISO: backup falhou (seguindo com o deploy)"

log "Roles do Postgres (escala_app / evolution_app)"
./scripts/db-roles.sh

log "Migrations"
docker compose run --rm app npx prisma migrate deploy

log "Seed"
# ADMIN_EMAIL/ADMIN_PASSWORD não estão no env do app/worker: são lidas do .env
# (sem executar o arquivo) e repassadas só para o container do seed.
valor_env() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2-; }
ADMIN_EMAIL="$(valor_env ADMIN_EMAIL)" ADMIN_PASSWORD="$(valor_env ADMIN_PASSWORD)" \
  docker compose run --rm -e ADMIN_EMAIL -e ADMIN_PASSWORD app node dist/seed.js

log "Subindo app e worker"
docker compose up -d
# O bind mount de web/dist pode ficar desatualizado se a pasta foi recriada
docker compose restart caddy

log "Status"
docker compose ps
