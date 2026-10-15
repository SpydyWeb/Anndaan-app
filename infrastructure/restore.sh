#!/bin/sh
# Restore a database dump into the running stack (DESTRUCTIVE: replaces current data).
# Usage: docker compose exec backup /restore.sh /backups/annadaan-db-YYYYMMDD-HHMMSS.dump
set -eu
file="${1:?usage: restore.sh <dump file>}"
echo "This replaces ALL data in $POSTGRES_DB with $file. Type RESTORE to continue:"
read -r answer
[ "$answer" = "RESTORE" ] || { echo "aborted"; exit 1; }
PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner "$file"
echo "restored $file"
