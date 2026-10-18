#!/usr/bin/env bash
# Oda Realtime duman testi (inceleme §4.1): yalitilmis yigini kurar, iki fazi
# kosar, yigini siler. Uzak hosta baglanmaz; yalniz bu dizindeki compose
# projesi (ba-rt-smoke). Sirlar her kosuda rastgele uretilir, diske yalniz
# .state/ altinda (mod 600) yazilir ve cikista silinir. KEEP=1 yigini birakir.
set -Eeuo pipefail
umask 077
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$here"
[[ -f dist/smoke.mjs ]] || { echo "run.sh: dist/smoke.mjs yok; once: node build.mjs" >&2; exit 1; }

rand() { openssl rand -hex "$1"; }
export SMOKE_DB_PASSWORD SMOKE_TENANT_SECRET SMOKE_ADMIN_SECRET
SMOKE_DB_PASSWORD="$(rand 16)"
SMOKE_TENANT_SECRET="$(rand 32)"
SMOKE_ADMIN_SECRET="$(rand 32)"
DB_ENC_KEY="$(rand 8)"
SECRET_KEY_BASE="$(rand 32)"
METRICS_JWT_SECRET="$(rand 32)"
RELEASE_COOKIE="$(rand 32)"

compose=(docker compose -p ba-rt-smoke -f compose.yaml)
cleanup() {
  "${compose[@]}" --profile runner down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf .state
}
if [[ "${KEEP:-}" != 1 ]]; then trap cleanup EXIT; fi
mkdir -p .state

log() { printf '\n== %s\n' "$*"; }
psql_() { "${compose[@]}" exec -T db psql -X -q -v ON_ERROR_STOP=1 -U postgres "$@"; }

# Faz ayari. before = bugunku VPS (SEED_SELF_HOST=true -> tenant sirri ==
# API_JWT_SECRET, aud dogrulamasi yok). after = onerilen VPS ayari.
write_env() {
  local seed api validators=''
  if [[ "$1" == before ]]; then
    seed=true; api="$SMOKE_TENANT_SECRET"
  else
    seed=false; api="$SMOKE_ADMIN_SECRET"
    validators='JWT_CLAIM_VALIDATORS={"aud":"bilge-arena-realtime"}'
  fi
  cat > .state/realtime.env <<EOF
DB_HOST=db
DB_PORT=5432
DB_NAME=bilge_arena_dev
DB_USER=postgres
DB_PASSWORD=${SMOKE_DB_PASSWORD}
DB_AFTER_CONNECT_QUERY=SET search_path TO _realtime
DB_ENC_KEY=${DB_ENC_KEY}
API_JWT_SECRET=${api}
SECRET_KEY_BASE=${SECRET_KEY_BASE}
METRICS_JWT_SECRET=${METRICS_JWT_SECRET}
ERL_AFLAGS=-proto_dist inet_tcp -kernel inet_dist_use_interface {127,0,0,1}
ERL_EPMD_ADDRESS=127.0.0.1
RELEASE_COOKIE=${RELEASE_COOKIE}
GEN_RPC_SOCKET_IP=127.0.0.1
CLUSTER_STRATEGIES=NONE
ECTO_IPV6=false
RLIMIT_NOFILE=10000
APP_NAME=ba-rt-smoke
SEED_SELF_HOST=${seed}
SELF_HOST_TENANT_NAME=ws-dev
RUN_JANITOR=true
${validators}
EOF
}

log "db: build + up"
write_env before
"${compose[@]}" up -d --build --wait db

log "db: uretim SQL zinciri (0..26)"
psql_ -d postgres <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
SQL
psql_ -d postgres -v app_password="$(rand 16)" -v auth_password="$(rand 16)" -f /sql/0_init_db.sql >/dev/null
# Uretimdeki gibi: oda nesneleri bilge_arena_app sahipliginde (dosya
# basliklarindaki "psql -U" kullanicisi), rol/sema/yayin/ACL dosyalari superuser.
app_psql() { "${compose[@]}" exec -T db psql -X -q -v ON_ERROR_STOP=1 -U bilge_arena_app "$@"; }
for f in 0a_auth_schema_usage 0b_authenticated_role_membership 1_realtime_schemas; do
  psql_ -d bilge_arena_dev -f "/sql/$f.sql" >/dev/null
done
for f in 2_rooms 3_rooms_rls 5_rooms_functions_lobby 6_rooms_functions_game \
  7_rooms_functions_relay 8_rooms_functions_create 9_rooms_auto_advance \
  10_lobby_preview_question 11_rooms_public_discovery 12_solo_mode \
  13_replay_clone 14_bot_answers 15_async_room_members 16_async_functions \
  17_async_rls 18_auto_advance_async_filter 19_async_bot \
  21_async_bot_user_paced 22_pre_create_rounds_distinct 23_shuffle_options_anti_bias; do
  app_psql -d bilge_arena_dev -f "/sql/$f.sql" >/dev/null
done
for f in 25_realtime_publication 26_rooms_acl_hardening; do
  psql_ -d bilge_arena_dev -f "/sql/$f.sql" >/dev/null
done
psql_ -d bilge_arena_dev -f /sql/26_rooms_acl_hardening_test.sql 2>&1 | grep -c 'OK Test' | sed 's/^/26 test OK satiri: /'

log "realtime: faz before (bugunku VPS ayari)"
"${compose[@]}" up -d --wait realtime
for _ in $(seq 1 30); do
  [[ "$(psql_ -d bilge_arena_dev -Atc "SELECT to_regclass('realtime.messages') IS NOT NULL")" == t ]] && break
  sleep 2
done
# realtime.messages gunluk bolumlerini uretimde janitor onceden acar (VPS'te
# messages_2026_10_12..18); burada janitor ilk 10 dk calismaz. Ayni adlarla
# (Realtime IF NOT EXISTS kullanir) dun..+3 gun acilir.
psql_ -d bilge_arena_dev >/dev/null <<'SQL'
DO $$
DECLARE d date;
BEGIN
  FOR d IN SELECT generate_series(current_date - 1, current_date + 3, interval '1 day')::date LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS realtime.%I PARTITION OF realtime.messages FOR VALUES FROM (%L) TO (%L)',
      'messages_' || to_char(d, 'YYYY_MM_DD'), d, d + 1);
  END LOOP;
END $$;
SQL
before_rc=0
"${compose[@]}" --profile runner run --rm -T runner node smoke.mjs before || before_rc=$?

log "db: 27_realtime_room_channel_auth + test"
psql_ -d bilge_arena_dev -f /sql/27_realtime_room_channel_auth.sql >/dev/null
psql_ -d bilge_arena_dev -f /sql/27_realtime_room_channel_auth_test.sql 2>&1 | grep -E 'OK Test|ASSERT|ERROR'

log "realtime: faz after (SEED_SELF_HOST=false, ayri API_JWT_SECRET, aud dogrulamasi)"
write_env after
"${compose[@]}" up -d --wait --force-recreate realtime
echo "tenant kaydi korundu: $(psql_ -d bilge_arena_dev -Atc "SELECT count(*) FROM _realtime.tenants WHERE external_id = 'ws-dev'")"
after_rc=0
"${compose[@]}" --profile runner run --rm -T runner node smoke.mjs after || after_rc=$?

log "sonuc: before=$before_rc after=$after_rc"
[[ $before_rc -eq 0 && $after_rc -eq 0 ]]
