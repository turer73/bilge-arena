#!/usr/bin/env bash
# ============================================================
# Bilge Arena Supabase Free tier — daily pg_dump
# ============================================================
# VPS Contabo'da gunluk 02:00 TR'de calisir.
# Output: /opt/backup/data/YYYY-MM-DD/bilge-arena.sql.gz
# (master backup.sh 03:00'da bunu R2 + Google Drive'a sync eder)
#
# pg_dump panola-postgres container'in v16.13 binary'sini kullanir.
# Supabase external URL'ye baglanir (panola-postgres icin port 5432
# zaten acik ve dis baglantilar normal calisir).
# ============================================================

set -euo pipefail

ENV_FILE="/opt/backup/bilge-arena/.env"
DATE=$(date +%Y-%m-%d)
BACKUP_DIR="/opt/backup/data/${DATE}"
OUT="${BACKUP_DIR}/bilge-arena.sql.gz"
TMP="${OUT}.tmp"
LOG_FILE="/opt/backup/logs/bilge-arena_${DATE}.log"

mkdir -p "$BACKUP_DIR" /opt/backup/logs

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*" | tee -a "$LOG_FILE"; }
fail() { log "ERROR: $*"; exit "${2:-1}"; }

log "=========================================="
log "Bilge Arena pg_dump basliyor: $DATE"
log "Hedef: $OUT"

# .env yukle
if [ ! -f "$ENV_FILE" ]; then
  fail ".env eksik: $ENV_FILE — SUPABASE_DB_URL ekle"
fi
# shellcheck disable=SC1090
. "$ENV_FILE"

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  fail "SUPABASE_DB_URL bos"
fi

# pg_dump via panola-postgres container (PG 16.13)
# --no-owner --no-acl: rol bagimsiz restore (KVKK audit + farkli VPS'e tasinabilir)
# stdin/stdout pipe: docker exec -i, container icinde gzip yok host gzip kullan
EXIT=0
timeout 600 docker exec panola-postgres \
    pg_dump --dbname="$SUPABASE_DB_URL" \
    --no-owner --no-acl \
    --no-publications --no-subscriptions \
    --format=plain 2>>"$LOG_FILE" | gzip -9 > "$TMP" || EXIT=$?

if [ "$EXIT" -ne 0 ]; then
  rm -f "$TMP"
  if [ "$EXIT" -eq 124 ]; then
    fail "timeout 600s (Free tier yavas olabilir, suresi artir)"
  fi
  if grep -q "Connection refused\|could not connect\|FATAL" "$LOG_FILE" 2>/dev/null; then
    fail "Connection failed (Supabase auto-pause olabilir, dashboard'da unpause et)"
  fi
  fail "pg_dump exit=$EXIT"
fi

# Atomic rename — yarim dosya R2 sync'ine gitmez
mv "$TMP" "$OUT"

# Integrity: gzip dosya bozuk mu
if ! gzip -t "$OUT" 2>>"$LOG_FILE"; then
  fail "Gzip integrity bozuk"
fi

# Sanity: ic icerik var mi (en az 100 byte SQL)
DECOMPRESSED=$(zcat "$OUT" | head -c 1000 | wc -c)
if [ "$DECOMPRESSED" -lt 100 ]; then
  fail "Dump cok kucuk ($DECOMPRESSED byte) — icerik anlamsiz olabilir"
fi

SIZE=$(du -sh "$OUT" | cut -f1)
log "OK: $OUT ($SIZE) — gzip integrity OK"

# Latest symlink (restore-test icin)
ln -sf "$OUT" /opt/backup/bilge-arena/latest.sql.gz

log "Bilge Arena pg_dump basariyla bitti"
exit 0
