#!/usr/bin/env bash
# =============================================================================
# Bilge Arena cron installer
# =============================================================================
# PR1 mergelendikten sonra calistir. Mevcut crontab'i koruyarak Bilge Arena
# scriptleri icin entry'ler ekler. Idempotent: eski entry'ler varsa once silinir,
# sonra eklenir.
#
# Plan referansi: docs/plans/2026-04-27-oda-sistemi-implementation.md Task 0.5 + Task 1.3
#
# Plan-deviations:
#   #19 (RETRACTED 2026-04-27): VPS Europe/Istanbul +03 olarak konfigure;
#       master backup cron "0 2 * * *" = 02:00 TR, questions-sync 02:30 TR
#       ("30 2 * * *") plan ile hizali.
#   #21 pg_cron yerine VPS cron: rooms-retention.sh 3 mod arguman ile 3 ayri
#       entry olarak kayitli (archive-purge / archive-transition / audit-retention).
#   #47 (PR2c yeni): rooms-relay.sh her dakika (* * * * *). System cron min
#       granularity 1 dakika, plan'in 1-saniye pg_cron interval'i ulasilamaz.
#       Stalled game UX impact max ~80sn (round 20sn + relay 60sn).
#
# Eklenen entry'ler:
#   30 02 * * *   questions-sync.sh                         (02:30 TR daily)
#   00 03 * * *   rooms-retention.sh archive-purge          (03:00 TR daily)
#   15 03 * * *   rooms-retention.sh archive-transition     (03:15 TR daily)
#   30 03 * * 0   rooms-retention.sh audit-retention        (03:30 TR Pazar)
#   *  *  * * *   rooms-relay.sh                            (her dakika game-loop)
# =============================================================================

set -euo pipefail

QSYNC=/opt/bilge-arena/scripts/questions-sync.sh
RETN=/opt/bilge-arena/scripts/rooms-retention.sh
RELAY=/opt/bilge-arena/scripts/rooms-relay.sh
LOG=/opt/bilge-arena/logs/cron.log

# Pre-flight: scriptler executable mi?
for s in "$QSYNC" "$RETN" "$RELAY"; do
  if [ ! -x "$s" ]; then
    echo "ERROR: $s bulunamadi veya executable degil" >&2
    exit 1
  fi
done

# Cron entry'leri
QSYNC_ENTRY="30 2 * * * ${QSYNC} >> ${LOG} 2>&1"
PURGE_ENTRY="0 3 * * * ${RETN} archive-purge >> ${LOG} 2>&1"
TRANS_ENTRY="15 3 * * * ${RETN} archive-transition >> ${LOG} 2>&1"
AUDIT_ENTRY="30 3 * * 0 ${RETN} audit-retention >> ${LOG} 2>&1"
RELAY_ENTRY="* * * * * ${RELAY} >> ${LOG} 2>&1"

# Idempotent: bilge-arena script'lerine ait eski entry'leri temizle, yenilerini
# ekle. Diger projelerin cron'u korunur.
{
  crontab -l 2>/dev/null \
    | grep -vE 'questions-sync\.sh|rooms-retention\.sh|rooms-relay\.sh' \
    || true
  echo "$QSYNC_ENTRY"
  echo "$PURGE_ENTRY"
  echo "$TRANS_ENTRY"
  echo "$AUDIT_ENTRY"
  echo "$RELAY_ENTRY"
} | crontab -

echo "OK: cron entry'leri kuruldu (5 toplam)"
echo "Aktif Bilge Arena entry'leri:"
crontab -l | grep -E 'questions-sync\.sh|rooms-retention\.sh|rooms-relay\.sh' \
  || echo "(entry not found - investigate)"
