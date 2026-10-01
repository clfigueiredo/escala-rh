#!/usr/bin/env bash
# Cria/atualiza as roles de aplicação do Postgres (sem superusuário) e
# garante que elas sejam donas das próprias bases e de todos os objetos.
#
#   escala_app    -> base `escala`,    schema `public`        (app/worker, Prisma)
#   evolution_app -> base `evolution`, schema `evolution_api` (Evolution API)
#
# O superusuário (POSTGRES_USER) continua existindo só para backup/restore/admin.
# Idempotente: pode rodar quantas vezes quiser (ex.: após um restore).
#
# Uso: ./scripts/db-roles.sh [escala|evolution|todas]   (padrão: todas)
# Senhas lidas do .env: APP_DB_PASSWORD, EVOLUTION_DB_PASSWORD.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

ALVO="${1:-todas}"

# Lê uma variável do .env sem executar o arquivo
valor_env() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2-; }

if ! docker compose ps --status running --services | grep -qx postgres; then
  echo "[db-roles] ERRO: container postgres não está rodando." >&2
  exit 1
fi

psql_super() { # $1 = base; SQL via stdin
  docker compose exec -T postgres sh -c \
    'PGOPTIONS="-c client_min_messages=warning" psql -U "$POSTGRES_USER" -d "$1" -v ON_ERROR_STOP=1 -q' _ "$1"
}

# $1 role  $2 senha  $3 base  $4 schema
configurar() {
  local role="$1" senha="$2" base="$3" schema="$4"
  if [[ ! "$senha" =~ ^[A-Za-z0-9]{24,}$ ]]; then
    echo "[db-roles] ERRO: senha de $role ausente ou inválida no .env (use só [A-Za-z0-9], mín. 24)." >&2
    exit 1
  fi

  # 1) Role + dono da base (na base postgres)
  psql_super postgres <<SQL
SELECT format('CREATE ROLE %I LOGIN', '$role')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$role')\gexec
ALTER ROLE "$role" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '$senha';
SELECT 'CREATE DATABASE "$base"'
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = '$base')\gexec
ALTER DATABASE "$base" OWNER TO "$role";
REVOKE ALL ON DATABASE "$base" FROM PUBLIC;
GRANT CONNECT, TEMPORARY, CREATE ON DATABASE "$base" TO "$role";
SQL

  # 2) Schema e todos os objetos dele passam para a role
  #    (REASSIGN OWNED BY do superusuário bootstrap falha; por isso ALTER em loop)
  psql_super "$base" <<SQL
CREATE SCHEMA IF NOT EXISTS "$schema";
ALTER SCHEMA "$schema" OWNER TO "$role";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
DO \$\$
DECLARE r record;
BEGIN
  -- tabelas, views, mat. views, tabelas estrangeiras (sequências "owned by" vão junto)
  FOR r IN SELECT c.relname, c.relkind FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = '$schema' AND c.relkind IN ('r','p','v','m','f')
              AND pg_get_userbyid(c.relowner) <> '$role'
  LOOP
    EXECUTE format('ALTER %s %I.%I OWNER TO %I',
      CASE r.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW'
                     WHEN 'f' THEN 'FOREIGN TABLE' ELSE 'TABLE' END,
      '$schema', r.relname, '$role');
  END LOOP;
  -- sequências avulsas
  FOR r IN SELECT c.relname FROM pg_class c
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = '$schema' AND c.relkind = 'S'
              AND pg_get_userbyid(c.relowner) <> '$role'
  LOOP
    EXECUTE format('ALTER SEQUENCE %I.%I OWNER TO %I', '$schema', r.relname, '$role');
  END LOOP;
  -- tipos: enum, domain, composite avulso
  FOR r IN SELECT t.typname, t.typtype FROM pg_type t
             JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = '$schema' AND t.typtype IN ('e','d','c','r','m')
              AND (t.typrelid = 0 OR (SELECT relkind FROM pg_class WHERE oid = t.typrelid) = 'c')
              AND t.typname NOT LIKE '\\_%'
              AND pg_get_userbyid(t.typowner) <> '$role'
  LOOP
    EXECUTE format('ALTER %s %I.%I OWNER TO %I',
      CASE r.typtype WHEN 'd' THEN 'DOMAIN' ELSE 'TYPE' END,
      '$schema', r.typname, '$role');
  END LOOP;
  -- funções/procedures
  FOR r IN SELECT p.oid::regprocedure AS assinatura, p.prokind FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = '$schema' AND pg_get_userbyid(p.proowner) <> '$role'
  LOOP
    EXECUTE format('ALTER %s %s OWNER TO %I',
      CASE r.prokind WHEN 'p' THEN 'PROCEDURE' WHEN 'a' THEN 'AGGREGATE' ELSE 'FUNCTION' END,
      r.assinatura, '$role');
  END LOOP;
END
\$\$;
GRANT ALL ON SCHEMA "$schema" TO "$role";
GRANT ALL ON ALL TABLES    IN SCHEMA "$schema" TO "$role";
GRANT ALL ON ALL SEQUENCES IN SCHEMA "$schema" TO "$role";
GRANT ALL ON ALL FUNCTIONS IN SCHEMA "$schema" TO "$role";
-- objetos criados no futuro por qualquer um dos dois (migrations rodam como a role)
ALTER DEFAULT PRIVILEGES FOR ROLE "$role" IN SCHEMA "$schema" GRANT ALL ON TABLES    TO "$role";
ALTER DEFAULT PRIVILEGES FOR ROLE "$role" IN SCHEMA "$schema" GRANT ALL ON SEQUENCES TO "$role";
ALTER DEFAULT PRIVILEGES FOR ROLE "$role" IN SCHEMA "$schema" GRANT ALL ON FUNCTIONS TO "$role";
ALTER ROLE "$role" IN DATABASE "$base" SET search_path TO "$schema", public;
SQL
  echo "[db-roles] OK  $role -> base $base, schema $schema"
}

case "$ALVO" in
  escala|todas)    configurar escala_app    "$(valor_env APP_DB_PASSWORD)"       escala    public ;;&
  evolution|todas) configurar evolution_app "$(valor_env EVOLUTION_DB_PASSWORD)" evolution evolution_api ;;&
  escala|evolution|todas) ;;
  *) echo "Uso: $0 [escala|evolution|todas]" >&2; exit 1 ;;
esac
