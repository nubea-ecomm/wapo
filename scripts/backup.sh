#!/bin/sh
set -eu
umask 077

directory=${BACKUP_DIR:-artifacts/backups}
mkdir -p "$directory"
output=${1:-"$directory/wapo-$(date -u +%Y%m%dT%H%M%SZ).dump"}

docker compose exec -T postgres pg_dump \
  --username wapo \
  --dbname wapo \
  --format custom \
  --no-owner \
  --no-privileges > "$output"

test -s "$output"
echo "$output"
