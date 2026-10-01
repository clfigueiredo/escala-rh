#!/usr/bin/env bash
# Restaura um dump gerado por backup.sh.
#
# Uso:
#   ./scripts/restore.sh [-y] backups/AAAA-MM-DD_HHMM_escala.sql.gz [base_destino]
#
# - A base de destino é deduzida do nome do arquivo (_escala / _evolution),
#   ou informada no 2º argumento (ex.: uma base temporária para teste).
# - Se o destino for `escala` ou `evolution`, para app/worker/evolution antes
#   e sobe de novo ao final. Destino diferente: cria a base se não existir e
#   não mexe nos serviços.
# - Pede confirmação; -y pula a confirmação.
# - O restore roda COMO a role da aplicação (escala_app / evolution_app, deduzida
#   pelo nome do arquivo), então todos os objetos continuam pertencendo a ela
#   (os dumps do backup.sh são --no-owner). Base temporária é criada com essa
#   role como dona. Em `escala`/`evolution` roda ./scripts/db-roles.sh no fim.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

SIM=0
if [[ "${1:-}" == "-y" ]]; then SIM=1; shift; fi

ARQ="${1:-}"
if [[ -z "$ARQ" || ! -f "$ARQ" ]]; then
  echo "Uso: $0 [-y] <arquivo.sql.gz> [base_destino]" >&2
  exit 1
fi

BASE="${2:-}"
if [[ -z "$BASE" ]]; then
  case "$(basename "$ARQ")" in
    *_escala.sql.gz)    BASE=escala ;;
    *_evolution.sql.gz) BASE=evolution ;;
    *) echo "Não foi possível deduzir a base pelo nome; informe-a no 2º argumento." >&2; exit 1 ;;
  esac
fi
if [[ ! "$BASE" =~ ^[a-z_][a-z0-9_]*$ ]]; then
  echo "Nome de base inválido: $BASE" >&2; exit 1
fi

case "$(basename "$ARQ")" in
  *_escala.sql.gz)    ROLE=escala_app ;;
  *_evolution.sql.gz) ROLE=evolution_app ;;
  *) echo "Não foi possível deduzir a role (arquivo deve terminar em _escala.sql.gz ou _evolution.sql.gz)." >&2; exit 1 ;;
esac

gzip -t "$ARQ" || { echo "Arquivo corrompido: $ARQ" >&2; exit 1; }

PRODUCAO=0
[[ "$BASE" == "escala" || "$BASE" == "evolution" ]] && PRODUCAO=1

echo "Arquivo : $ARQ"
echo "Destino : base '$BASE' (dona: $ROLE)"
if (( PRODUCAO )); then
  echo "ATENÇÃO : os dados atuais da base '$BASE' serão SUBSTITUÍDOS."
  echo "          Recomendado rodar ./scripts/backup.sh antes."
fi
if (( ! SIM )); then
  read -r -p "Confirmar restore? digite 'sim': " resp
  [[ "$resp" == "sim" ]] || { echo "Cancelado."; exit 1; }
fi

# Serviços que usam a base e estão rodando (serão parados e religados)
PARAR=()
if (( PRODUCAO )); then
  rodando="$(docker compose ps --status running --services)"
  if [[ "$BASE" == "escala" ]]; then candidatos=(app worker); else candidatos=(evolution); fi
  for s in "${candidatos[@]}"; do
    grep -qx "$s" <<<"$rodando" && PARAR+=("$s")
  done
fi

religar() {
  if (( ${#PARAR[@]} )); then
    echo "[restore] subindo novamente: ${PARAR[*]}"
    docker compose up -d "${PARAR[@]}"
  fi
}
trap religar EXIT

if (( ${#PARAR[@]} )); then
  echo "[restore] parando: ${PARAR[*]}"
  docker compose stop "${PARAR[@]}"
fi

# A role precisa existir (criada por db-roles.sh / init do postgres)
docker compose exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='"'"'$1'"'"'" | grep -q 1' _ "$ROLE" \
  || { echo "Role $ROLE não existe; rode ./scripts/db-roles.sh antes." >&2; exit 1; }

# Cria a base se não existir (dona = role da aplicação) e garante a posse
docker compose exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='"'"'$1'"'"'" | grep -q 1 \
   || createdb -U "$POSTGRES_USER" -O "$2" "$1"
   psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -q -c "ALTER DATABASE \"$1\" OWNER TO \"$2\""' _ "$BASE" "$ROLE"

echo "[restore] restaurando em '$BASE' como $ROLE..."
# Conexão local (socket) dentro do container; objetos criados ficam com a role.
gunzip -c "$ARQ" | docker compose exec -T postgres sh -c \
  'PGOPTIONS="-c client_min_messages=warning" psql -U "$2" -d "$1" -v ON_ERROR_STOP=1 -q' _ "$BASE" "$ROLE" >/dev/null

if (( PRODUCAO )); then
  echo "[restore] reaplicando posse/permissões (db-roles.sh $BASE)"
  ./scripts/db-roles.sh "$BASE"
fi

echo "[restore] concluído."
