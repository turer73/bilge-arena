#!/usr/bin/env bash
# Bootstrap the disposable Oda/PostgREST database only. It never contacts a remote host.
set -Eeuo pipefail
umask 077
readonly BOOTSTRAP_ID='bilge-arena-synthetic-room-bootstrap-v1'
readonly PROJECT_REQUIRED='bilge-arena-academy-test'
readonly DATABASE_REQUIRED='bilge_arena_dev'
readonly SERVICE='rooms-db'
readonly SOURCE_ROOT='/source'
die() { printf 'room-bootstrap: %s\n' "$*" >&2; exit 1; }
require_env() { local name="$1"; [[ -n "${!name:-}" ]] || die "$name is required"; }
require_env ROOM_COMPOSE_PROJECT
require_env ROOM_APP_PASSWORD
require_env ROOM_AUTH_PASSWORD
[[ "$ROOM_COMPOSE_PROJECT" == "$PROJECT_REQUIRED" ]] || die "refusing compose project '$ROOM_COMPOSE_PROJECT' (expected $PROJECT_REQUIRED)"
[[ "${ROOM_DATABASE:-$DATABASE_REQUIRED}" == "$DATABASE_REQUIRED" ]] || die "refusing database '${ROOM_DATABASE:-}' (0_init_db.sql creates $DATABASE_REQUIRED)"
[[ "${ROOM_POSTGRES_SUPERUSER:-postgres}" == 'postgres' ]] || die 'ROOM_POSTGRES_SUPERUSER must be postgres'
[[ ${#ROOM_APP_PASSWORD} -ge 16 ]] || die 'ROOM_APP_PASSWORD must be at least 16 characters'
[[ ${#ROOM_AUTH_PASSWORD} -ge 16 ]] || die 'ROOM_AUTH_PASSWORD must be at least 16 characters'
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$script_dir"
compose=(docker compose -p "$ROOM_COMPOSE_PROJECT")
mapfile -t services < <("${compose[@]}" config --services)
printf '%s\n' "${services[@]}" | grep -Fxq "$SERVICE" || die "compose project has no $SERVICE service"
container_id="$("${compose[@]}" ps -q "$SERVICE")"
[[ -n "$container_id" ]] || die "$SERVICE is not running in $ROOM_COMPOSE_PROJECT"
actual_project="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$container_id")"
actual_service="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.service" }}' "$container_id")"
[[ "$actual_project" == "$PROJECT_REQUIRED" && "$actual_service" == "$SERVICE" ]] || die 'container label mismatch; refusing target'
run_psql() { local database="$1"; shift; "${compose[@]}" exec -T "$SERVICE" psql -X -v ON_ERROR_STOP=1 -U postgres -d "$database" "$@"; }
query_scalar() { run_psql "$1" -Atqc "$2"; }
for source_file in infra/vps/bilge-arena/sql/0_init_db.sql infra/vps/bilge-arena/sql/2_rooms.sql infra/vps/bilge-arena/sql/11_rooms_public_discovery.sql infra/test/klipper/room-seed.sql; do
  "${compose[@]}" exec -T "$SERVICE" sh -ceu "test -r '$SOURCE_ROOT/$source_file'" || die "read-only source mount missing $source_file"
done
database_exists="$(query_scalar postgres "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = '$DATABASE_REQUIRED')")"
if [[ "$database_exists" == 't' ]]; then
  marker_relation="$(query_scalar "$DATABASE_REQUIRED" "SELECT to_regclass('public.room_bootstrap_meta') IS NOT NULL")"
  if [[ "$marker_relation" == 't' ]]; then
    marker="$(query_scalar "$DATABASE_REQUIRED" "SELECT bootstrap_id FROM public.room_bootstrap_meta WHERE singleton = TRUE")"
    [[ "$marker" == "$BOOTSTRAP_ID" ]] || die 'existing database has an unknown bootstrap marker; do not reuse it'
    printf 'room-bootstrap: already initialized (%s)\n' "$BOOTSTRAP_ID"
    exit 0
  fi
  core_relation="$(query_scalar "$DATABASE_REQUIRED" "SELECT to_regclass('public.rooms') IS NOT NULL OR to_regprocedure('auth.uid()') IS NOT NULL")"
  [[ "$core_relation" == 'f' ]] || die 'existing unmarked database contains room/auth objects; refusing non-destructive retry'
  die "database $DATABASE_REQUIRED already exists without the synthetic bootstrap marker"
fi
printf 'room-bootstrap: initializing isolated %s/%s\n' "$ROOM_COMPOSE_PROJECT" "$DATABASE_REQUIRED"
run_psql postgres <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
SQL
run_psql postgres -v "app_password=$ROOM_APP_PASSWORD" -v "auth_password=$ROOM_AUTH_PASSWORD" -f "$SOURCE_ROOT/infra/vps/bilge-arena/sql/0_init_db.sql"
[[ "$(query_scalar "$DATABASE_REQUIRED" 'SELECT current_database()')" == "$DATABASE_REQUIRED" ]] || die 'database identity check failed after initialization'
apply_sql() { local file="$1"; printf 'room-bootstrap: apply %s\n' "$file"; run_psql "$DATABASE_REQUIRED" -f "$SOURCE_ROOT/infra/vps/bilge-arena/sql/$file"; }
run_sql_test() { local file="$1"; printf 'room-bootstrap: verify %s\n' "$file"; run_psql "$DATABASE_REQUIRED" -f "$SOURCE_ROOT/infra/vps/bilge-arena/sql/$file"; }
# Current sync UI: lobby/create/join/start/submit/reveal/advance, discovery,
# quick-play/replay/bots, distinct snapshots, option shuffling and Realtime.
# Retention, host cron, async-only and duplicate-cleanup SQL are intentionally excluded.
apply_sql 0a_auth_schema_usage.sql
apply_sql 0b_authenticated_role_membership.sql
apply_sql 1_realtime_schemas.sql
apply_sql 2_rooms.sql
run_sql_test 2_rooms_test.sql
apply_sql 3_rooms_rls.sql
run_sql_test 3_rooms_rls_test.sql
apply_sql 5_rooms_functions_lobby.sql
run_sql_test 5_rooms_functions_lobby_test.sql
apply_sql 6_rooms_functions_game.sql
run_sql_test 6_rooms_functions_game_test.sql
apply_sql 7_rooms_functions_relay.sql
apply_sql 8_rooms_functions_create.sql
apply_sql 9_rooms_auto_advance.sql
apply_sql 10_lobby_preview_question.sql
apply_sql 11_rooms_public_discovery.sql
apply_sql 12_solo_mode.sql
apply_sql 13_replay_clone.sql
apply_sql 14_bot_answers.sql
apply_sql 22_pre_create_rounds_distinct.sql
apply_sql 23_shuffle_options_anti_bias.sql
apply_sql 25_realtime_publication.sql
printf 'room-bootstrap: seed synthetic questions\n'
run_psql "$DATABASE_REQUIRED" -f "$SOURCE_ROOT/infra/test/klipper/room-seed.sql"
run_psql "$DATABASE_REQUIRED" -v "bootstrap_id=$BOOTSTRAP_ID" <<'SQL'
CREATE TABLE public.room_bootstrap_meta (
  singleton boolean PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  bootstrap_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON public.room_bootstrap_meta FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO public.room_bootstrap_meta (singleton, bootstrap_id) VALUES (TRUE, :'bootstrap_id');
SQL
question_count="$(query_scalar "$DATABASE_REQUIRED" "SELECT count(*) FROM public.questions WHERE source = 'synthetic-room-bootstrap' AND is_active AND category = 'denklemler' AND difficulty = 2")"
[[ "$question_count" -ge 10 ]] || die "synthetic question postcondition failed: $question_count"
printf 'room-bootstrap: ready (%s synthetic denklemler/difficulty-2 questions)\n' "$question_count"
