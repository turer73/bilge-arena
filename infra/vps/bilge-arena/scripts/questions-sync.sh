#!/usr/bin/env bash
# =============================================================================
# Bilge Arena questions snapshot sync (Secenek A)
# =============================================================================
# Hedef: Mevcut Supabase pg_dump (02:00 TR) icindeki questions / categories /
#        game_categories / games tablolarini bilge_arena_dev'e SELECT-only
#        restore eder. Calisma penceresi: 02:30 TR (master backup'tan 30 dk
#        sonra; gozlemlenen pg_dump suresi 3-7 dk, comfortable buffer).
#        PR1 mergelendikten sonra cron'a eklenir.
#
# Plan referansi: docs/plans/2026-04-27-oda-sistemi-implementation.md Task 0.5
#
# Plan-deviations:
#   #19 RETRACTED 2026-04-27: Onceki oturumda master backup'in 03:00 TR'de
#       calistigi varsayilmisti (eski mtime'lardan). Gercekte crontab "0 2 * * *"
#       (02:00 TR) ve script header'i "02:00 TR" diyor. Tarihsel mtime 03:03-07
#       eski "0 3 * * *" zamanlamasinin kalintisi. questions-sync 02:30 TR'ye
#       cekildi (plan ile hizali). install-cron.sh entry: "30 2 * * *".
#   #20 Mevcut Supabase schema'sinda categories/game_categories/games tablolari
#       YOK (zcat | grep COPY public ile dogrulandi 2026-04-27). Sadece
#       public.questions sync edilir. Schema normalize edildiginde
#       (Sprint 1+) tablolar listeye eklenir.
#
# Calistirma (manuel test):
#   ssh root@100.126.113.23 "/opt/bilge-arena/scripts/questions-sync.sh"
# =============================================================================

set -euo pipefail

DUMP=/opt/backup/bilge-arena/latest.sql.gz
DATE=$(date +%Y-%m-%d)
LOG_DIR=/opt/bilge-arena/logs
LOG_FILE="${LOG_DIR}/questions-sync_${DATE}.log"
mkdir -p "$LOG_DIR"

# Telegram credentials master backup .env'inden gelir
ENV_FILE=/opt/backup/bilge-arena/.env
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" | tee -a "$LOG_FILE"; }

send_telegram() {
  local message="$1"
  if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
    curl -fsS -m 15 -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -H 'Content-Type: application/json' \
      -d "{\"chat_id\":${TELEGRAM_CHAT_ID},\"text\":\"${message}\"}" \
      > /dev/null 2>&1 || true
  fi
}

fail() {
  log "ERROR: $1"
  send_telegram "Bilge Arena questions-sync HATASI%0ATarih: ${DATE}%0AHata: $1"
  exit 1
}

if [ ! -f "$DUMP" ]; then
  fail "Dump yok: $DUMP (gece backup'i kontrol et)"
fi

START=$SECONDS
log "questions-sync basliyor, kaynak: $DUMP"

# 1) public.questions tablosunu extract et. PostgreSQL pg_dump COPY
# bloklarini "\\." satiri sonlandirir; sed range ile yakalanir.
# Plan-deviation #20: Diger tablolar (categories vb) mevcut schema'da yok.
TMP_SQL=$(mktemp)
DUMP_DECOMP=$(mktemp)
trap 'rm -f "$TMP_SQL" "$DUMP_DECOMP"' EXIT

zcat "$DUMP" > "$DUMP_DECOMP"

for table in questions; do
  sed -n "/^COPY public\\.${table} /,/^\\\\\\.\$/p" "$DUMP_DECOMP" >> "$TMP_SQL"
done

LINES=$(wc -l < "$TMP_SQL")
[ "$LINES" -lt 100 ] && fail "Extracted SQL cok kucuk ($LINES satir)"

# 2) bilge_arena_dev'de TRUNCATE + restore (transactional)
. /opt/bilge-arena/secrets/db.env

docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev <<'SQLEOF' >> "$LOG_FILE" 2>&1
BEGIN;
TRUNCATE public.questions CASCADE;
SQLEOF

docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev < "$TMP_SQL" >> "$LOG_FILE" 2>&1

docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev -c 'COMMIT;' >> "$LOG_FILE" 2>&1

QC=$(docker exec -i panola-postgres psql -U bilge_arena_app -d bilge_arena_dev -t -c 'SELECT COUNT(*) FROM public.questions' | tr -d ' ')
DURATION=$((SECONDS - START))

log "OK: $QC soru, $LINES satir, ${DURATION}sn"
send_telegram "Bilge Arena questions-sync OK%0ATarih: ${DATE}%0ASoru: ${QC}%0ASure: ${DURATION}sn"
exit 0
