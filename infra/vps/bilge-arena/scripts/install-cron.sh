#!/usr/bin/env bash
# =============================================================================
# Bilge Arena cron installer
# =============================================================================
# PR1 mergelendikten sonra calistir. Mevcut crontab'i koruyarak
# questions-sync.sh icin 02:30 TR daily entry ekler. Idempotent: eski entry
# varsa once siler, sonra ekler.
#
# Plan referansi: docs/plans/2026-04-27-oda-sistemi-implementation.md Task 0.5
#
# Plan-deviation #19 (RETRACTED 2026-04-27): VPS Europe/Istanbul +03 olarak
# konfigure, master backup cron "0 2 * * *" = 02:00 TR (planda 02:00 ile
# hizali). questions-sync 02:30 TR ("30 2 * * *") - plan ile hizali. Tarihsel
# 03:03-07 mtime'lar eski cron'un izi.
# =============================================================================

set -euo pipefail

SCRIPT=/opt/bilge-arena/scripts/questions-sync.sh
LOG=/opt/bilge-arena/logs/cron.log
ENTRY="30 2 * * * ${SCRIPT} >> ${LOG} 2>&1"

if [ ! -x "$SCRIPT" ]; then
  echo "ERROR: $SCRIPT bulunamadi veya executable degil" >&2
  exit 1
fi

# Idempotent: eski entry'yi temizle, yeni entry'yi ekle
( crontab -l 2>/dev/null | grep -v 'questions-sync.sh' || true ; echo "$ENTRY" ) | crontab -

echo "OK: cron kuruldu - 02:30 TR daily"
echo "Aktif crontab:"
crontab -l | grep questions-sync || echo "(entry not found - investigate)"
