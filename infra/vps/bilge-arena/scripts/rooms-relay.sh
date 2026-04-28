#!/usr/bin/env bash
# =============================================================================
# Bilge Arena Oda Sistemi: rooms-relay (system cron)
# =============================================================================
# Hedef: auto_relay_tick() PG fonksiyonunu cagirir, stalled active/reveal
#        rooms'u ilerletir.
#
# Plan referansi: docs/plans/2026-04-27-oda-sistemi-implementation.md
#                 Sprint 1 PR2c (Task 2.5 system cron version)
#
# Plan-deviations:
#   #19 (kalitim): pg_cron yok, system cron + bash. Plan'in 1-saniye
#       interval'i (pg_cron) ulasilamaz; system cron min granularity 1 dakika.
#   #47 (kalitim): cron */1 * * * * (her dakika). Stalled game UX impact:
#       max ~80sn (round 20sn + relay 60sn). Sub-minute icin systemd timer
#       OnCalendar=*:*:0/5 alternatif.
#
# Calistirma (system cron):
#   * * * * * /opt/bilge-arena/scripts/rooms-relay.sh >> /opt/bilge-arena/logs/cron.log 2>&1
#
# Manuel test:
#   /opt/bilge-arena/scripts/rooms-relay.sh
#
# Cikti: log dosyasina (/opt/bilge-arena/logs/rooms-relay_<TARIH>.log)
#        Telegram alert: hata olursa (silent on no-op).
# =============================================================================

set -euo pipefail

LOG_DIR=/opt/bilge-arena/logs
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/rooms-relay_$(date +%Y-%m-%d).log"

log() {
  printf '[%s] %s\n' "$(date '+%H:%M:%S')" "$1" | tee -a "$LOG_FILE" >&2
}

fail() {
  log "ERROR: $1"
  send_telegram "Bilge Arena rooms-relay HATA: $1"
  exit 1
}

send_telegram() {
  local msg="$1"
  if [[ -n "${TELEGRAM_BOT_TOKEN:-}" && -n "${TELEGRAM_CHAT_ID:-}" ]]; then
    curl -sS -m 5 -X POST \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TELEGRAM_CHAT_ID}" \
      -d "text=${msg}" \
      >/dev/null 2>&1 || true
  fi
}

# Source telegram secrets if present (optional)
if [[ -f /opt/bilge-arena/secrets/telegram.env ]]; then
  # shellcheck source=/dev/null
  source /opt/bilge-arena/secrets/telegram.env
fi

START_TS=$(date +%s)
log "auto_relay_tick basladi"

# Container kontrol
if ! docker ps --format '{{.Names}}' | grep -q '^panola-postgres$'; then
  fail "panola-postgres container calismiyor"
fi

# Function call - returns count of operations
SQL='SELECT public.auto_relay_tick() AS ops_count;'

COUNT=$(printf '%s' "$SQL" | docker exec -i panola-postgres psql \
    -v ON_ERROR_STOP=on \
    -U bilge_arena_app -d bilge_arena_dev \
    -t -A 2>>"$LOG_FILE") \
  || fail "auto_relay_tick call basarisiz; ON_ERROR_STOP transaction'i otomatik rollback'e cevirdi"

# Trim whitespace
COUNT=$(echo "$COUNT" | tr -d ' ')

# Defensive: numeric check (set -e altinda non-numeric abort eder)
if [[ ! "$COUNT" =~ ^[0-9]+$ ]]; then
  fail "auto_relay_tick non-numeric output: '$COUNT'"
fi

ELAPSED=$(($(date +%s) - START_TS))
log "OK: ${COUNT} operasyon tamamlandi, ${ELAPSED}sn"

# Telegram sadece >0 ops icin (her-dakika tick'te 0 = noise)
# Gunluk summary degil; aktif gameplay metric ozetcisi
if [[ "$COUNT" -gt 0 ]]; then
  log "INFO: ${COUNT} stalled room ilerletildi"
  # Telegram intentional disabled — her dakika 1+ alert oyun anlik state'inde
  # spam'e yol acar. Daily/hourly aggregation icin Grafana entegrasyonu plan.
fi

exit 0
