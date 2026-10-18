#!/usr/bin/env bash
# =============================================================================
# Bilge Arena oda DB: bos bir PostgreSQL'e 0..27 migration + tum *_test.sql
# =============================================================================
# Hedef: sql/ altindaki migration zincirini sifirdan kurmak ve her testi
#        ON_ERROR_STOP ile kosmak. CI (.github/workflows/rooms-sql-tests.yml)
#        ve yerel/izole dogrulama ayni betigi kullanir.
#
# Gereken ortam (libpq):
#   PGHOST, PGPORT          hedef sunucu (CANLI DB DEGIL: betik rol + DB yaratir)
#   PGUSER, PGPASSWORD      SUPERUSER (canlida ba_admin, CI'da postgres)
#   APP_PASSWORD            bilge_arena_app parolasi (varsayilan: yalniz test)
#   AUTH_PASSWORD           bilge_arena_authenticator parolasi
#
# Sunucu wal_level=logical olmali (25_realtime_publication.sql kontrol eder).
#
# Kimin uyguladigi canli calistirma notlarini izler:
#   superuser       : 0_init_db, 1_realtime_schemas, 0a, 0b, 25, 26, 27
#   bilge_arena_app : 2..24 (nesne sahibi bilge_arena_app; SECURITY DEFINER
#                     fonksiyonlar superuser olarak calismaz)
#   testler         : superuser (FORCE RLS bypass + SET ROLE anon/authenticated)
#
# anon/authenticated/service_role canlida GoTrue'dan geliyor (0_init_db.sql
# basligi); bos sunucuda burada ayni ozelliklerle yaratilir.
#
# Cikis kodu: herhangi bir migration ya da test kirilirsa 1.
# =============================================================================

set -euo pipefail

SQL_DIR="${SQL_DIR:-$(cd "$(dirname "$0")/../sql" && pwd)}"
APP_PASSWORD="${APP_PASSWORD:-ci_only_app_password}"
AUTH_PASSWORD="${AUTH_PASSWORD:-ci_only_auth_password}"
DB=bilge_arena_dev

SUPERUSER_MIGRATIONS=(0_init_db 1_realtime_schemas 0a_auth_schema_usage 0b_authenticated_role_membership)
SUPERUSER_LATE=(25_realtime_publication 26_rooms_acl_hardening 27_realtime_room_channel_auth)

psql_super() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }
psql_app() { PGUSER=bilge_arena_app PGPASSWORD="$APP_PASSWORD" psql -X -q -v ON_ERROR_STOP=1 "$@"; }

# Numara siralamasi: "2_", "10_", "26_" (sort -V); 0/0a/0b/1 ayrica ele alinir.
numbered_migrations() {
  find "$SQL_DIR" -maxdepth 1 -name '[0-9]*.sql' ! -name '*_test.sql' -printf '%f\n' \
    | sed 's/\.sql$//' \
    | grep -E '^([2-9]|[1-9][0-9])_' \
    | sort -V
}

is_superuser_late() {
  local m
  for m in "${SUPERUSER_LATE[@]}"; do [[ "$1" == "$m" ]] && return 0; done
  return 1
}

# 27 realtime.messages uzerine politika yazar. Tablo ve realtime.topic() canlida
# Realtime'in tenant migration'larindan gelir; bos sunucuda yoklar. Canli
# semanin (2026-10-18 olcumu: sutunlar, RLS acik, anon/authenticated/service_role
# SELECT/INSERT/UPDATE) bolumlenmemis kopyasi kurulur. Gercek Realtime ile
# prova: infra/test/realtime/run.sh.
ensure_realtime_messages_stub() {
  psql_super -d "$DB" <<'SQL'
DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NULL THEN
    CREATE TABLE realtime.messages (
      topic          text NOT NULL,
      extension      text NOT NULL,
      payload        jsonb,
      event          text,
      private        boolean DEFAULT false,
      updated_at     timestamp without time zone NOT NULL DEFAULT now(),
      inserted_at    timestamp without time zone NOT NULL DEFAULT now(),
      id             uuid NOT NULL DEFAULT gen_random_uuid(),
      binary_payload bytea,
      skip_broadcast boolean NOT NULL DEFAULT false
    );
    ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
    GRANT SELECT, INSERT, UPDATE ON realtime.messages TO anon, authenticated, service_role;
    RAISE NOTICE 'CI: realtime.messages kopyasi kuruldu (Realtime yok)';
  END IF;
  IF to_regprocedure('realtime.topic()') IS NULL THEN
    CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql STABLE
      AS $f$ select nullif(current_setting('realtime.topic', true), '')::text; $f$;
  END IF;
END $$;
SQL
}

echo "== Sunucu: $(psql_super -d postgres -tAc 'SHOW server_version') wal_level=$(psql_super -d postgres -tAc 'SHOW wal_level')"

# Kurulu bir oda DB'sine (canli dahil) yanlislikla yonelmeyi engelle.
if [[ "$(psql_super -d postgres -tAc "SELECT count(*) FROM pg_database WHERE datname = '$DB'")" != 0 ]] \
   || [[ "$(psql_super -d postgres -tAc "SELECT count(*) FROM pg_roles WHERE rolname = 'bilge_arena_app'")" != 0 ]]; then
  echo "HATA: $DB veya bilge_arena_app zaten var; bu betik yalniz bos sunucuda kosar." >&2
  exit 2
fi

echo "== Supabase rolleri (anon, authenticated, service_role)"
psql_super -d postgres <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END $$;
SQL

echo "== 0_init_db.sql (rol + DB)"
psql_super -d postgres \
  -v app_password="$APP_PASSWORD" -v auth_password="$AUTH_PASSWORD" \
  -f "$SQL_DIR/0_init_db.sql"

for m in "${SUPERUSER_MIGRATIONS[@]:1}"; do
  echo "== $m.sql (superuser)"
  psql_super -d "$DB" -f "$SQL_DIR/$m.sql"
done

while read -r m; do
  if is_superuser_late "$m"; then
    if [[ "$m" == 27_realtime_room_channel_auth ]]; then ensure_realtime_messages_stub; fi
    echo "== $m.sql (superuser)"
    psql_super -d "$DB" -f "$SQL_DIR/$m.sql" >/dev/null
  else
    echo "== $m.sql (bilge_arena_app)"
    psql_app -d "$DB" -f "$SQL_DIR/$m.sql" >/dev/null
  fi
done < <(numbered_migrations)

echo
echo "== Testler"
passed=()
failed=()
while read -r t; do
  log=$(mktemp)
  if psql_super -d "$DB" -f "$SQL_DIR/$t" >"$log" 2>&1; then
    passed+=("$t")
    echo "PASS $t"
  else
    failed+=("$t")
    echo "FAIL $t"
    grep -E 'ERROR|FAIL|CONTEXT' "$log" | head -n 8 | sed 's/^/    /'
  fi
  rm -f "$log"
done < <(find "$SQL_DIR" -maxdepth 1 -name '*_test.sql' -printf '%f\n' | sort -V)

echo
echo "== Ozet: ${#passed[@]} gecti, ${#failed[@]} kirik"
if ((${#failed[@]})); then
  printf '  kirik: %s\n' "${failed[@]}"
  exit 1
fi
