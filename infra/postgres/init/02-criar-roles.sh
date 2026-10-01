#!/bin/bash
# Executado pelo entrypoint do postgres SOMENTE na primeira inicialização
# (volume pg_data vazio). Cria as roles de aplicação, sem superusuário:
#   escala_app    -> dona da base `escala`    (app/worker, Prisma migrate)
#   evolution_app -> dona da base `evolution` e do schema `evolution_api`
# Em volume já existente use ./scripts/db-roles.sh (faz o mesmo e ainda
# transfere a posse de objetos já criados).
set -euo pipefail

for v in APP_DB_PASSWORD EVOLUTION_DB_PASSWORD; do
  if [[ ! "${!v:-}" =~ ^[A-Za-z0-9]{24,}$ ]]; then
    echo "init: $v ausente/inválida (use só [A-Za-z0-9], mín. 24)" >&2
    exit 1
  fi
done

psql -v ON_ERROR_STOP=1 -q --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
	CREATE ROLE escala_app    LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${APP_DB_PASSWORD}';
	CREATE ROLE evolution_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${EVOLUTION_DB_PASSWORD}';
	ALTER DATABASE escala    OWNER TO escala_app;
	ALTER DATABASE evolution OWNER TO evolution_app;
	REVOKE ALL ON DATABASE escala    FROM PUBLIC;
	REVOKE ALL ON DATABASE evolution FROM PUBLIC;
	GRANT CONNECT, TEMPORARY, CREATE ON DATABASE escala    TO escala_app;
	GRANT CONNECT, TEMPORARY, CREATE ON DATABASE evolution TO evolution_app;
EOSQL

psql -v ON_ERROR_STOP=1 -q --username "$POSTGRES_USER" --dbname escala <<-EOSQL
	ALTER SCHEMA public OWNER TO escala_app;
EOSQL

psql -v ON_ERROR_STOP=1 -q --username "$POSTGRES_USER" --dbname evolution <<-EOSQL
	CREATE SCHEMA IF NOT EXISTS evolution_api AUTHORIZATION evolution_app;
EOSQL
