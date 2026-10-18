#!/usr/bin/env bash
# =============================================================================
# Bilge Arena Realtime env generator (idempotent)
# =============================================================================
# VPS uzerinde calistirilir: /opt/bilge-arena/secrets/realtime.env uretir.
# Bu script repo'da committed - secret degerleri ICERMEZ.
# Calistirma: ssh root@VPS "bash /opt/bilge-arena/scripts/generate-realtime-env.sh"
#
# Idempotency: ESKI realtime.env varsa DB_ENC_KEY/API_JWT_SECRET/SECRET_KEY_BASE/
# RELEASE_COOKIE/METRICS_JWT_SECRET DEGERLERINI YENIDEN URETMEZ (eski tenant verisi
# DB_ENC_KEY ile sifrelenmis; kaybolursa _realtime.tenants kayitlari okunamaz hale
# gelir). Sadece DB_PASSWORD ve degisken parametreleri gunceller.
#
# 2026-10-04 (supabase/realtime v2.30.34 -> v2.140.7, not #101797 GHSA-9vjf):
#   - METRICS_JWT_SECRET: v2.140'ta zorunlu (yoksa boot'ta System.EnvError).
#   - SELF_HOST_TENANT_NAME=ws-dev: Realtime tenant'i Host basliginin ilk
#     etiketinden cozer (ws-dev.bilgearena.com -> "ws-dev"). Eski "realtime-dev"
#     tenant adi yuzunden her baglanti TenantNotFound aliyordu.
#   - CLUSTER_STRATEGIES=NONE: tek dugum. Varsayilan POSTGRES stratejisi
#     RELEASE_COOKIE'yi LISTEN kanal adi yapar; 64 karakter > 63 sinir -> crash.
#   - GEN_RPC_SOCKET_IP=127.0.0.1: dugumler arasi RPC (5369) yalniz loopback
#     (ir-20261003 epmd/dist loopback kararinin devami).
#   - DB_USER=bilge_arena_realtime: REPLICATION yetkili ayri rol; _realtime ve
#     realtime semalarinin sahibi (tenant migration'lari ALTER ister).
#   - postgres_changes ACIK (4 Ekim ikinci adim): bilge-arena-db artik Dockerfile.db ile
#     postgres:16-alpine + wal2json; output_plugin_libraries=wal2json. Tenant migration'lari
#     icin rol: CREATEROLE, createrole_self_grant='set, inherit', supabase_admin/postgres/
#     dashboard_user (NOLOGIN) uyeligi WITH SET, GRANT SET ON PARAMETER log_min_messages.
# =============================================================================

set -euo pipefail

SECRETS_DIR="/opt/bilge-arena/secrets"
DB_ENV="${SECRETS_DIR}/db.env"
TARGET="${SECRETS_DIR}/realtime.env"

if [[ ! -f "$DB_ENV" ]]; then
  echo "ERROR: $DB_ENV not found. Run init scripts first." >&2
  exit 1
fi

# shellcheck source=/dev/null
source "$DB_ENV"

if [[ -z "${BILGE_ARENA_REALTIME_PASSWORD:-}" ]]; then
  echo "ERROR: BILGE_ARENA_REALTIME_PASSWORD not set in $DB_ENV (role bilge_arena_realtime)" >&2
  exit 1
fi
RT_PWD="${BILGE_ARENA_REALTIME_PASSWORD}"

extract_existing() {
  local key="$1"
  if [[ -f "$TARGET" ]]; then
    grep -E "^${key}=" "$TARGET" | head -1 | cut -d= -f2- || true
  fi
}

# Plan-deviation #15: DB_ENC_KEY = 16 raw ASCII bytes (NOT 32 hex chars).
DB_ENC_KEY="$(extract_existing DB_ENC_KEY)"
if [[ -n "$DB_ENC_KEY" && ${#DB_ENC_KEY} -ne 16 ]]; then
  echo "WARN: Existing DB_ENC_KEY length=${#DB_ENC_KEY} (need 16). Regenerating."
  DB_ENC_KEY=""
fi
if [[ -z "$DB_ENC_KEY" ]]; then
  DB_ENC_KEY="$(openssl rand -base64 12)"
  echo "INFO: Generated new DB_ENC_KEY (16 chars base64, AES-128 raw key)"
else
  echo "INFO: Reused existing DB_ENC_KEY (16 chars, idempotent)"
fi

# 2026-10-18 (derin inceleme §4.1, disc #2611): tenant sirri ile yonetim API
# sirri AYRI. Olcum: seeds.exs her acilista ws-dev tenant'ini SILIP
# jwt_secret = API_JWT_SECRET ile yeniden kuruyordu; API_JWT_SECRET ayni zamanda
# Realtime yonetim API'sinin (/api/tenants) sirri. /api/realtime/token ile
# imzali her kullanici token'i GET /api/tenants -> 200 aliyordu.
#   - TENANT_JWT_SECRET: _realtime.tenants (ws-dev) jwt_secret degeri; Vercel
#     BILGE_ARENA_REALTIME_JWT_SECRET ile AYNI. Realtime bu degiskeni okumaz;
#     tenant'i yeniden tohumlamak (SEED=1) icin burada saklanir.
#   - API_JWT_SECRET: yalniz yonetim API'si. Vercel'de YOK.
# Gecis: eski dosyada tek sir vardi; o deger TENANT_JWT_SECRET'a tasinir
# (tenant ve Vercel degismez), API_JWT_SECRET yeniden uretilir.
# SEED_SELF_HOST varsayilani false (tohumlama tenant'i API_JWT_SECRET ile yeniden
# kurar). Ilk kurulumda (tenant yok) bir kez: SEED=1 ile calistir -> realtime'i
# baslat -> SEED'siz yeniden calistir -> realtime'i yeniden yarat.
TENANT_JWT_SECRET="$(extract_existing TENANT_JWT_SECRET)"
API_JWT_SECRET="$(extract_existing API_JWT_SECRET)"
if [[ -z "$TENANT_JWT_SECRET" ]]; then
  if [[ -n "$API_JWT_SECRET" ]]; then
    TENANT_JWT_SECRET="$API_JWT_SECRET"
    echo "INFO: Moved old API_JWT_SECRET to TENANT_JWT_SECRET (tenant/Vercel degeri degismedi)"
  else
    TENANT_JWT_SECRET="$(openssl rand -hex 32)"
    echo "INFO: Generated new TENANT_JWT_SECRET (Vercel BILGE_ARENA_REALTIME_JWT_SECRET'a yazilmali)"
  fi
fi
if [[ -z "$API_JWT_SECRET" || "$API_JWT_SECRET" == "$TENANT_JWT_SECRET" ]]; then
  API_JWT_SECRET="$(openssl rand -hex 32)"
  echo "INFO: Generated new admin-only API_JWT_SECRET (32 bytes hex)"
else
  echo "INFO: Reused existing admin-only API_JWT_SECRET (idempotent)"
fi

if [[ "${SEED:-0}" == 1 ]]; then
  SEED_SELF_HOST=true
  # seeds.exs tenant sirrini API_JWT_SECRET'tan okur: bu acilis icin tenant degeri.
  WRITTEN_API_JWT_SECRET="$TENANT_JWT_SECRET"
  echo "WARN: SEED=1 tek seferlik tohumlama. Realtime acildiktan sonra SEED'siz yeniden calistir."
else
  SEED_SELF_HOST=false
  WRITTEN_API_JWT_SECRET="$API_JWT_SECRET"
fi

SECRET_KEY_BASE="$(extract_existing SECRET_KEY_BASE)"
if [[ -z "$SECRET_KEY_BASE" ]]; then
  SECRET_KEY_BASE="$(openssl rand -hex 32)"
  echo "INFO: Generated new SECRET_KEY_BASE (32 bytes hex)"
else
  echo "INFO: Reused existing SECRET_KEY_BASE (idempotent)"
fi

# Prometheus /metrics ucu icin bearer sirri (v2.140 zorunlu). Disaridan erisim yok;
# yalniz zorunlu oldugu icin uretilir ve korunur.
METRICS_JWT_SECRET="$(extract_existing METRICS_JWT_SECRET)"
if [[ -z "$METRICS_JWT_SECRET" ]]; then
  METRICS_JWT_SECRET="$(openssl rand -hex 32)"
  echo "INFO: Generated new METRICS_JWT_SECRET (32 bytes hex)"
else
  echo "INFO: Reused existing METRICS_JWT_SECRET (idempotent)"
fi

# ir-20261003 (disc #2086 / #2099): Erlang dagitim cookie'si imaj varsayilani
# (/app/releases/COOKIE, herkese acik) OLMASIN. Mevcut degeri KORU (idempotent),
# yoksa uret. Rotasyon istenirse realtime.env'den satiri sil ve yeniden calistir.
RELEASE_COOKIE="$(extract_existing RELEASE_COOKIE)"
if [[ -z "$RELEASE_COOKIE" ]]; then
  RELEASE_COOKIE="$(openssl rand -base64 64 | tr -dc 'A-Za-z0-9' | head -c 64)"
  echo "INFO: Generated new RELEASE_COOKIE (64 chars)"
else
  echo "INFO: Reused existing RELEASE_COOKIE (idempotent)"
fi

# Dosyayi yaz (idempotent overwrite, secrets korundu)
umask 077
cat > "$TARGET" <<EOF
# Generated by generate-realtime-env.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
# DO NOT COMMIT. Production secrets.
# Plan-deviation #13: tenant HS256 (TENANT_JWT_SECRET). Channel-auth: Next.js
#   /api/realtime/token; Vercel BILGE_ARENA_REALTIME_JWT_SECRET = TENANT_JWT_SECRET.
#   API_JWT_SECRET yalniz yonetim API'si (2026-10-18, disc #2611).
#   JWT_CLAIM_VALIDATORS: token aud=bilge-arena-realtime olmali (realtime-token.ts).
# Plan-deviation #14: ECTO_IPV6=false override (image defaults to IPv6).
# 2026-10-04: postgres_changes acik (wal2json imaji), broadcast+presence+postgres_changes.

DB_HOST=bilge-arena-db
DB_PORT=5432
DB_NAME=bilge_arena_dev
DB_USER=bilge_arena_realtime
DB_PASSWORD=${RT_PWD}
DB_AFTER_CONNECT_QUERY=SET search_path TO _realtime
DB_ENC_KEY=${DB_ENC_KEY}
API_JWT_SECRET=${WRITTEN_API_JWT_SECRET}
TENANT_JWT_SECRET=${TENANT_JWT_SECRET}
JWT_CLAIM_VALIDATORS={"aud":"bilge-arena-realtime"}
SECRET_KEY_BASE=${SECRET_KEY_BASE}
METRICS_JWT_SECRET=${METRICS_JWT_SECRET}
# ir-20261003: epmd ve dist portu yalniz loopback (node adi @127.0.0.1, env.sh).
# RELEASE_DISTRIBUTION=none env'den CALISMAZ: imajin env.sh'i name'i kosulsuz export eder.
ERL_AFLAGS=-proto_dist inet_tcp -kernel inet_dist_use_interface {127,0,0,1}
ERL_EPMD_ADDRESS=127.0.0.1
RELEASE_COOKIE=${RELEASE_COOKIE}
GEN_RPC_SOCKET_IP=127.0.0.1
CLUSTER_STRATEGIES=NONE
ECTO_IPV6=false
RLIMIT_NOFILE=10000
APP_NAME=bilge-arena-realtime
SEED_SELF_HOST=${SEED_SELF_HOST}
SELF_HOST_TENANT_NAME=ws-dev
RUN_JANITOR=true
EOF
chmod 600 "$TARGET"

echo "OK: $TARGET written ($(wc -c < "$TARGET") bytes, mode 600)"
echo "Secrets: DB_ENC_KEY (16B), TENANT_JWT_SECRET (32B), API_JWT_SECRET (32B, admin), SECRET_KEY_BASE (32B), METRICS_JWT_SECRET (32B), RELEASE_COOKIE (64); SEED_SELF_HOST=${SEED_SELF_HOST}"
echo "Tenant: SELF_HOST_TENANT_NAME=ws-dev, DB_USER=bilge_arena_realtime, CLUSTER_STRATEGIES=NONE"
