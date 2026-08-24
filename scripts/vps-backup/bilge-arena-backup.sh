#!/usr/bin/env bash
# ============================================================
# Bilge Arena Supabase Free tier — daily pg_dump
# ============================================================
# VPS Contabo'da gunluk 02:00 TR'de calisir.
# Output: /opt/backup/data/YYYY-MM-DD/bilge-arena.sql.gz
# (master backup.sh 03:00'da bunu R2 + Google Drive'a sync eder)
#
# pg_dump throwaway postgres:17-alpine container icinde calisir. Baglanti URI'si
# process argumanina veya Docker env metadata'sina yazilmaz; 0600 izinli gecici
# dosya salt-okunur baglanir ve yalnizca konteyner icinde okunur.
# ============================================================

set -euo pipefail
umask 077

# Concurrent run korumasi (crontab duplicate / elle tetikleme vs.)
LOCK_FILE=/tmp/bilge-arena-backup.lock
exec 200>"$LOCK_FILE"
flock -n 200 || { echo "[$(date +%H:%M:%S)] SKIP: baska bir bilge-arena-backup instance calisuyor" >> /opt/backup/logs/bilge-arena-cron.log; exit 0; }

ENV_FILE="/opt/backup/bilge-arena/.env"
DATE=$(date +%Y-%m-%d)
BACKUP_DIR="/opt/backup/data/${DATE}"
OUT="${BACKUP_DIR}/bilge-arena.sql.gz"
TMP="${OUT}.tmp"
LOG_FILE="/opt/backup/logs/bilge-arena_${DATE}.log"
START_TS=$SECONDS
DB_URL_FILE=""
TELEGRAM_CONFIG_FILE=""
NOTIFY_CHAT_ID=""
BACKUP_CONTAINER_NAME="bilge-arena-backup-${DATE}-$$"

cleanup() {
  docker rm --force -- "$BACKUP_CONTAINER_NAME" >/dev/null 2>&1 || true
  rm -f -- "$TMP"
  if [ -n "$DB_URL_FILE" ]; then
    rm -f -- "$DB_URL_FILE"
  fi
  if [ -n "$TELEGRAM_CONFIG_FILE" ]; then
    rm -f -- "$TELEGRAM_CONFIG_FILE"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$BACKUP_DIR" /opt/backup/logs

log() { printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$*" | tee -a "$LOG_FILE"; }

send_telegram() {
  local message="$1"
  if [ "${BILGE_BACKUP_DISABLE_NOTIFY:-false}" = "true" ]; then
    return 0
  fi
  if [ -n "$TELEGRAM_CONFIG_FILE" ] && [ -n "$NOTIFY_CHAT_ID" ]; then
    printf '{"chat_id":%s,"text":"%s"}' "$NOTIFY_CHAT_ID" "$message" | \
      curl -fsS -m 15 -X POST \
      --config "$TELEGRAM_CONFIG_FILE" \
      -H "Content-Type: application/json" \
      --data-binary @- \
      >/dev/null 2>&1 || true
  fi
}

fail() {
  log "ERROR: $1"
  send_telegram "Bilge Arena Backup HATASI\\nTarih: ${DATE}\\nHata: $1\\nLog: ${LOG_FILE}"
  exit "${2:-1}"
}

log "=========================================="
log "Bilge Arena pg_dump basliyor: $DATE"
log "Hedef: $OUT"

# .env yukle
if [ ! -f "$ENV_FILE" ]; then
  fail ".env eksik: $ENV_FILE — SUPABASE_DB_URL ekle"
fi
# shellcheck disable=SC1090
. "$ENV_FILE"

if [ "${BILGE_BACKUP_DISABLE_NOTIFY:-false}" != "true" ] && \
   [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  TELEGRAM_CONFIG_FILE="$(mktemp /tmp/bilge-arena-telegram-config.XXXXXX)"
  printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' \
    "$TELEGRAM_BOT_TOKEN" > "$TELEGRAM_CONFIG_FILE"
  NOTIFY_CHAT_ID="$TELEGRAM_CHAT_ID"
fi
unset TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  fail "SUPABASE_DB_URL bos"
fi

DB_URL_FILE="$(mktemp /tmp/bilge-arena-backup-dburl.XXXXXX)"
printf '%s' "$SUPABASE_DB_URL" > "$DB_URL_FILE"
unset SUPABASE_DB_URL

# pg_dump via disposable PG17 container.
# --no-owner: nesne sahipligini hedef Supabase yoneticisine birak.
# ACL'leri bilerek koruyoruz: authenticated/anon/service_role fonksiyon
# sinirlari yedegin guvenlik sozlesmesinin parcasidir.
EXIT=0
timeout 600 docker run --rm --network host \
  --name "$BACKUP_CONTAINER_NAME" \
  --env PGCONNECT_TIMEOUT=30 \
  --volume "$DB_URL_FILE:/run/secrets/bilge-arena-dburl:ro" \
  postgres:17-alpine \
  sh -c 'DBURL="$(cat /run/secrets/bilge-arena-dburl)"; exec pg_dump \
    --dbname="$DBURL" \
    --no-owner \
    --no-publications \
    --no-subscriptions \
    --format=plain' 2>>"$LOG_FILE" | gzip -9 > "$TMP" || EXIT=$?

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
if ! gzip -t -- "$OUT" 2>>"$LOG_FILE"; then
  fail "Gzip integrity bozuk"
fi

# Sanity: sikistirilmis cikti anlamli bir dump olamayacak kadar kucuk mu.
# Burada `gzip | head` kullanmiyoruz; `pipefail` altinda gzip'in SIGPIPE ile
# cikmasi saglikli bir yedegi yanlislikla basarisiz gosterebilir.
BYTES=$(stat -c %s -- "$OUT")
if [ "$BYTES" -lt 1000 ]; then
  fail "Dump cok kucuk ($BYTES byte) — icerik anlamsiz olabilir"
fi

SIZE=$(du -sh "$OUT" | cut -f1)
LINES=$(gzip -dc -- "$OUT" | wc -l)
TABLES=$(gzip -dc -- "$OUT" | grep -c '^CREATE TABLE' || true)
DURATION=$((SECONDS - START_TS))
log "OK: $OUT ($SIZE, $LINES satir, $TABLES tablo) — gzip integrity OK"

# Latest symlink (restore-test icin)
ln -sf "$OUT" /opt/backup/bilge-arena/latest.sql.gz

send_telegram "Bilge Arena Backup basarili\\nTarih: ${DATE}\\nBoyut: ${SIZE}\\nSatir: ${LINES}\\nTablo: ${TABLES}\\nSure: ${DURATION}sn"

log "Bilge Arena pg_dump basariyla bitti"
exit 0
