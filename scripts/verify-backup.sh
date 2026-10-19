#!/bin/sh
set -eu

backup=${1:?usage: scripts/verify-backup.sh BACKUP_FILE}
test -s "$backup"
database="wapo_restore_check_$(date +%s)_$$"

cleanup() {
  docker compose exec -T postgres dropdb --username wapo --if-exists "$database" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker compose exec -T postgres createdb --username wapo "$database"
docker compose exec -T postgres pg_restore \
  --username wapo \
  --dbname "$database" \
  --no-owner \
  --no-privileges < "$backup"
docker compose exec -T postgres psql \
  --username wapo \
  --dbname "$database" \
  --tuples-only \
  --command 'SELECT count(*) FROM schema_migrations' >/dev/null

echo "Backup restored successfully into disposable database $database"
