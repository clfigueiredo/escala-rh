#!/usr/bin/env bash
# Backup das bases `escala` e `evolution` (pg_dump via container postgres).
# Gera backups/AAAA-MM-DD_HHMM_<base>.sql.gz e apaga arquivos com mais de 14 dias.
# Uso: ./scripts/backup.sh        (cron diário às 03:00 — ver docs/07-operacao.md)
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

BACKUP_DIR="$DIR/backups"
RETENCAO_DIAS=14
BASES=(escala evolution)
CARIMBO="$(TZ=America/Sao_Paulo date +%Y-%m-%d_%H%M)"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
umask 077

if ! docker compose ps --status running --services | grep -qx postgres; then
  echo "[backup] ERRO: container postgres não está rodando." >&2
  exit 1
fi

falhas=0
for base in "${BASES[@]}"; do
  destino="$BACKUP_DIR/${CARIMBO}_${base}.sql.gz"
  tmp="${destino}.tmp"
  # --clean --if-exists: o dump recria os objetos ao restaurar
  if docker compose exec -T postgres sh -c \
       'pg_dump -U "$POSTGRES_USER" --clean --if-exists --no-owner --no-privileges "$1"' _ "$base" \
       | gzip -9 > "$tmp"; then
    mv "$tmp" "$destino"
    echo "[backup] OK  $base -> $(basename "$destino") ($(du -h "$destino" | cut -f1))"
  else
    rm -f "$tmp"
    echo "[backup] ERRO ao gerar dump de $base" >&2
    falhas=$((falhas + 1))
  fi
done

# Retenção
find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.sql.gz' -mtime +"$RETENCAO_DIAS" -print -delete \
  | sed 's/^/[backup] removido (retenção): /'

exit "$falhas"
