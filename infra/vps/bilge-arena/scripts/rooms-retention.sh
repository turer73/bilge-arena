#!/usr/bin/env bash
# =============================================================================
# Bilge Arena oda sistemi retention/archival cron (Sprint 1 PR1 Task 1.3)
# =============================================================================
# Hedef: pg_cron yerine VPS cron ile 3 retention job'i kosturmak
#        (plan-deviation #21).
#
# Modlar:
#   archive-transition  | UPDATE: state='completed' + ended_at<NOW()-7d
#                                 -> state='archived', archived_at=NOW()
#                                 (state machine kapsamasi)
#   archive-purge       | DELETE: state='archived' + archived_at<NOW()-30d
#                                 (subtablolar ON DELETE CASCADE)
#                                 (KVKK + storage hijyeni)
#   audit-retention     | DELETE: room_audit_log.created_at<NOW()-1y
#                                 (KVKK gun)
#
# Plan referansi: docs/plans/2026-04-27-oda-sistemi-implementation.md Task 1.3
#
# Plan-deviations:
#   #21 pg_cron yerine VPS cron (Sprint 0 audit). Telegram failover ve crontab
#       observability icin.
#   #31 Schema column drift duzeltildi: actual rooms tablosu
#       state IN ('lobby','active','reveal','completed','archived'),
#       archived_at, ended_at sutunlarina sahip (plan'da 'finished' / archive_after
#       / finished_at vardi). 4_rooms_retention_test.sql schema-vs-script uyumunu
#       dogruluyor.
#   #32 archive-purge retention penceresi 30 gun (plan acikca belirtmemisti);
#       KVKK gerekce: 1 ay replay query window yeterli, sonrasinda silmek
#       storage maliyetini sinirliyor. Degisiklik istenirse cron entry'sinde
#       komut argumani veya env override eklenmeli.
#
# Calistirma (manuel test):
#   /opt/bilge-arena/scripts/rooms-retention.sh archive-transition
#   /opt/bilge-arena/scripts/rooms-retention.sh archive-purge
#   /opt/bilge-arena/scripts/rooms-retention.sh audit-retention
#
# Cron entry'leri install-cron.sh tarafindan kurulur.
# =============================================================================

set -euo pipefail

MODE="${1:-}"
if [ -z "$MODE" ]; then
  echo "ERROR: mod argumani gerekli (archive-transition | archive-purge | audit-retention)" >&2
  exit 2
fi

DATE=$(date +%Y-%m-%d)
LOG_DIR=/opt/bilge-arena/logs
LOG_FILE="${LOG_DIR}/rooms-retention_${DATE}.log"
mkdir -p "$LOG_DIR"

# Telegram credentials master backup .env'inden gelir (questions-sync.sh ile ayni)
ENV_FILE=/opt/backup/bilge-arena/.env
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

log() { printf '[%s] [%s] %s\n' "$(date +%H:%M:%S)" "$MODE" "$*" | tee -a "$LOG_FILE"; }

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
  send_telegram "Bilge Arena rooms-retention HATASI%0AMod: ${MODE}%0ATarih: ${DATE}%0AHata: $1"
  exit 1
}

# DB credentials
. /opt/bilge-arena/secrets/db.env

# Mode'a gore SQL secimi. RETURNING + count(*) row count yakalar.
case "$MODE" in
  archive-transition)
    SQL="
WITH affected AS (
  UPDATE public.rooms
     SET state = 'archived', archived_at = NOW()
   WHERE state = 'completed'
     AND ended_at IS NOT NULL
     AND ended_at < NOW() - INTERVAL '7 days'
   RETURNING id
)
SELECT count(*) AS rows_affected FROM affected;
"
    ;;
  archive-purge)
    SQL="
WITH affected AS (
  DELETE FROM public.rooms
   WHERE state = 'archived'
     AND archived_at IS NOT NULL
     AND archived_at < NOW() - INTERVAL '30 days'
   RETURNING id
)
SELECT count(*) AS rows_affected FROM affected;
"
    ;;
  audit-retention)
    SQL="
WITH affected AS (
  DELETE FROM public.room_audit_log
   WHERE created_at < NOW() - INTERVAL '1 year'
   RETURNING id
)
SELECT count(*) AS rows_affected FROM affected;
"
    ;;
  *)
    fail "Bilinmeyen mod: $MODE (gecerli: archive-transition | archive-purge | audit-retention)"
    ;;
esac

START=$SECONDS
log "rooms-retention basliyor"

# psql -t (tuples-only) -A (unaligned) -> sadece sayinin kendisi cikar
ROWS=$(printf '%s' "$SQL" | docker exec -i panola-postgres psql \
    -v ON_ERROR_STOP=on \
    -U bilge_arena_app -d bilge_arena_dev \
    -t -A 2>>"$LOG_FILE") \
  || fail "psql query basarisiz; ON_ERROR_STOP transaction'i otomatik rollback'e cevirdi"

ROWS=$(echo "$ROWS" | tr -d ' ')
DURATION=$((SECONDS - START))

log "OK: $ROWS satir etkilendi, ${DURATION}sn"

# Sadece etkilenen satir varsa Telegram bildirimi (gurultu azaltma).
# Defensive: ROWS sayi degilse (psql tuhaf bir output verirse) sessizce atla;
# `[ "$ROWS" -gt 0 ]` set -e altinda non-numeric icin abort eder.
if [[ "$ROWS" =~ ^[0-9]+$ ]] && [ "$ROWS" -gt 0 ]; then
  send_telegram "Bilge Arena rooms-retention OK%0AMod: ${MODE}%0ATarih: ${DATE}%0ASatir: ${ROWS}%0ASure: ${DURATION}sn"
fi

exit 0
