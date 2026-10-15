#!/bin/sh
# Nightly Postgres + uploads backup, kept locally for 7 days and copied off-site with rclone.
# Off-site storage is configured purely by RCLONE_CONFIG_OFFSITE_* environment variables
# (e.g. Backblaze B2 or Cloudflare R2), so no credentials live in this repository.
set -eu

BACKUP_DIR=/backups
KEEP_DAYS=${BACKUP_KEEP_DAYS:-7}
RUN_AT=${BACKUP_HOUR_UTC:-21}  # 21:00 UTC = 02:30 IST-ish quiet hours

run_backup() {
  ts=$(date -u +%Y%m%d-%H%M%S)
  db="$BACKUP_DIR/annadaan-db-$ts.dump"
  files="$BACKUP_DIR/annadaan-uploads-$ts.tar.gz"
  echo "[backup] $ts starting"
  PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -Z 6 -f "$db.partial"
  mv "$db.partial" "$db"
  tar -czf "$files" -C /data uploads 2>/dev/null || true
  find "$BACKUP_DIR" -name 'annadaan-*' -mtime +"$KEEP_DAYS" -delete
  if [ -n "${RCLONE_CONFIG_OFFSITE_TYPE:-}" ]; then
    rclone copy "$BACKUP_DIR" "offsite:${OFFSITE_BUCKET:?set OFFSITE_BUCKET}/annadaan" --include 'annadaan-*' --max-age 26h
    rclone delete "offsite:${OFFSITE_BUCKET}/annadaan" --min-age "${OFFSITE_KEEP_DAYS:-30}d" || true
    echo "[backup] copied off-site"
  else
    echo "[backup] WARNING: off-site storage not configured; backup is only on this server"
  fi
  echo "[backup] done: $db"
}

if [ "${1:-}" = "now" ]; then
  run_backup
  exit 0
fi

echo "[backup] scheduler started; daily at ${RUN_AT}:00 UTC"
last=""
while true; do
  today=$(date -u +%Y%m%d)
  hour=$(date -u +%H)
  if [ "$hour" = "$RUN_AT" ] && [ "$last" != "$today" ]; then
    run_backup || echo "[backup] FAILED"
    last="$today"
  fi
  sleep 300
done
