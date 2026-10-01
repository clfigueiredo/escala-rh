#!/bin/bash
# Executado pelo entrypoint do postgres SOMENTE na primeira inicialização
# (volume pg_data vazio). A base `escala` é criada via POSTGRES_DB;
# aqui criamos a base `evolution`, usada pela Evolution API.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-EOSQL
	SELECT 'CREATE DATABASE evolution OWNER "$POSTGRES_USER"'
	WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'evolution')\gexec
EOSQL
