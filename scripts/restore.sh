#!/bin/sh
set -eu

backup=${1:?usage: CONFIRM_RESTORE=wapo scripts/restore.sh BACKUP_FILE}
test -s "$backup"

if [ "${CONFIRM_RESTORE:-}" != "wapo" ]; then
  echo 'Refusing destructive restore. Set CONFIRM_RESTORE=wapo after stopping API and worker services.' >&2
  exit 1
fi

docker compose exec -T postgres pg_restore \
  --username wapo \
  --dbname wapo \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges < "$backup"

echo 'Restore completed. Run migrations before restarting API and worker services.'
