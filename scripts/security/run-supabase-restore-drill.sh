#!/usr/bin/env bash

# Restore a Bilge Arena logical backup into an isolated, disposable Supabase
# Postgres container. The source dump is mounted read-only, the container has no
# network access, missing forward migrations are replayed from a read-only repo
# directory, and only aggregate verification results are printed.

set -euo pipefail

readonly DEFAULT_DUMP_PATH="/opt/backup/bilge-arena/latest.sql.gz"
readonly DEFAULT_IMAGE="supabase/postgres:17.6.1.136"

DUMP_PATH="${1:-$DEFAULT_DUMP_PATH}"
MIGRATIONS_DIR="${2:-}"
IMAGE="${SUPABASE_POSTGRES_IMAGE:-$DEFAULT_IMAGE}"
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
CONTAINER_NAME="bilge-arena-restore-drill-${RUN_ID}"
DATABASE_NAME="bilge_restore_drill"
DB_PASSWORD="$(openssl rand -hex 32)"

cleanup() {
  docker rm --force --volumes -- "$CONTAINER_NAME" >/dev/null 2>&1 || true
  unset POSTGRES_PASSWORD DB_PASSWORD
}
trap cleanup EXIT INT TERM

if [[ ! -e "$DUMP_PATH" ]]; then
  printf 'status=failed\nreason=dump_missing\ndump=%s\n' "$DUMP_PATH" >&2
  exit 2
fi

if [[ -z "$MIGRATIONS_DIR" || ! -d "$MIGRATIONS_DIR" ]]; then
  printf 'status=failed\nreason=migrations_directory_missing\n' >&2
  printf 'usage=%s DUMP_PATH MIGRATIONS_DIR\n' "$0" >&2
  exit 3
fi

DUMP_PATH="$(readlink -f -- "$DUMP_PATH")"
MIGRATIONS_DIR="$(readlink -f -- "$MIGRATIONS_DIR")"

if ! gzip -t -- "$DUMP_PATH"; then
  printf 'status=failed\nreason=gzip_integrity\ndump=%s\n' "$DUMP_PATH" >&2
  exit 4
fi

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  printf 'status=failed\nreason=image_missing\nimage=%s\n' "$IMAGE" >&2
  exit 5
fi

STARTED_AT="$(date +%s)"

export POSTGRES_PASSWORD="$DB_PASSWORD"
docker run --detach \
  --name "$CONTAINER_NAME" \
  --network none \
  --env POSTGRES_PASSWORD \
  --volume "$DUMP_PATH:/drill/source.sql.gz:ro" \
  "$IMAGE" >/dev/null
unset POSTGRES_PASSWORD DB_PASSWORD

READY=false
for _ in $(seq 1 120); do
  # The image briefly exposes a temporary init server before it shuts that
  # server down and execs the final Postgres process. Starting a restore during
  # that window produces an expected "administrator command" disconnect.
  INIT_COMPLETE=false
  if docker logs "$CONTAINER_NAME" 2>&1 | \
    grep -q 'PostgreSQL init process complete; ready for start up'; then
    INIT_COMPLETE=true
  fi
  if [[ "$INIT_COMPLETE" == "true" ]] && \
    docker exec "$CONTAINER_NAME" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    READY=true
    break
  fi

  if [[ "$(docker inspect --format '{{.State.Running}}' "$CONTAINER_NAME")" != "true" ]]; then
    docker logs --tail 100 "$CONTAINER_NAME" >&2
    printf 'status=failed\nreason=container_stopped\n' >&2
    exit 6
  fi

  sleep 1
done

if [[ "$READY" != "true" ]]; then
  docker logs --tail 100 "$CONTAINER_NAME" >&2
  printf 'status=failed\nreason=postgres_not_ready\n' >&2
  exit 7
fi

docker exec "$CONTAINER_NAME" createdb \
  --username supabase_admin \
  --template template0 \
  "$DATABASE_NAME"

# Hosted Supabase dumps can grant schema/table privileges to service roles that
# are created by the surrounding Realtime service rather than by the bare
# Postgres image. Pre-create only the audited, known platform role needed by
# this dump. NOLOGIN is deliberate: an actual recovery must provision the
# service credential independently; the database dump must not contain it.
docker exec -i "$CONTAINER_NAME" psql \
  --username supabase_admin \
  --dbname postgres \
  --variable ON_ERROR_STOP=1 \
  --quiet <<'SQL'
DO $bootstrap$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'supabase_realtime_admin'
  ) THEN
    CREATE ROLE supabase_realtime_admin NOLOGIN;
  END IF;
END
$bootstrap$;
SQL

RESTORE_STARTED_AT="$(date +%s)"
set +e
gzip -dc -- "$DUMP_PATH" | docker exec -i "$CONTAINER_NAME" \
  psql \
    --username supabase_admin \
    --dbname "$DATABASE_NAME" \
    --single-transaction \
    --variable ON_ERROR_STOP=1 \
    --quiet
RESTORE_EXIT=$?
set -e
RESTORE_FINISHED_AT="$(date +%s)"

if [[ "$RESTORE_EXIT" -ne 0 ]]; then
  docker inspect --format 'container_running={{.State.Running}} container_exit_code={{.State.ExitCode}} container_oom_killed={{.State.OOMKilled}}' \
    "$CONTAINER_NAME" >&2 || true
  docker logs --tail 120 "$CONTAINER_NAME" >&2 || true
  printf 'status=failed\nreason=restore_sql\nrestore_exit=%s\n' "$RESTORE_EXIT" >&2
  exit 8
fi

MIGRATIONS_STARTED_AT="$(date +%s)"
MIGRATIONS_APPLIED=0
MIGRATIONS_SKIPPED=0
for VERSION in $(seq 146 156); do
  mapfile -t MATCHES < <(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name "${VERSION}_*.sql" -print)
  if [[ "${#MATCHES[@]}" -ne 1 ]]; then
    printf 'status=failed\nreason=migration_file_count\nversion=%s\ncount=%s\n' \
      "$VERSION" "${#MATCHES[@]}" >&2
    exit 9
  fi

  MIGRATION_FILE="${MATCHES[0]}"
  MIGRATION_NAME="$(basename "$MIGRATION_FILE" .sql)"
  MIGRATION_PRESENT="$(docker exec -i "$CONTAINER_NAME" psql \
    --username supabase_admin \
    --dbname "$DATABASE_NAME" \
    --variable ON_ERROR_STOP=1 \
    --set "migration_version=$VERSION" \
    --set "migration_name=$MIGRATION_NAME" \
    --tuples-only \
    --no-align <<'SQL'
SELECT EXISTS(
  SELECT 1
  FROM supabase_migrations.schema_migrations
  WHERE version = :'migration_version' OR name = :'migration_name'
);
SQL
)"
  if [[ "$MIGRATION_PRESENT" == "t" ]]; then
    MIGRATIONS_SKIPPED=$((MIGRATIONS_SKIPPED + 1))
    continue
  fi

  docker exec -i "$CONTAINER_NAME" psql \
    --username supabase_admin \
    --dbname "$DATABASE_NAME" \
    --variable ON_ERROR_STOP=1 \
    --quiet < "$MIGRATION_FILE"

  docker exec -i "$CONTAINER_NAME" psql \
    --username supabase_admin \
    --dbname "$DATABASE_NAME" \
    --variable ON_ERROR_STOP=1 \
    --set "migration_version=$VERSION" \
    --set "migration_name=$MIGRATION_NAME" \
    --quiet <<'SQL'
INSERT INTO supabase_migrations.schema_migrations(
  version, statements, name, created_by, idempotency_key, rollback
) VALUES (
  :'migration_version', NULL, :'migration_name', 'restore-drill', NULL, NULL
)
ON CONFLICT (version) DO NOTHING;
SQL
  MIGRATIONS_APPLIED=$((MIGRATIONS_APPLIED + 1))
done
MIGRATIONS_FINISHED_AT="$(date +%s)"

printf 'restore_sql=passed\n'
printf 'image=%s\n' "$IMAGE"
printf 'dump=%s\n' "$DUMP_PATH"
printf 'dump_bytes=%s\n' "$(stat -c %s -- "$DUMP_PATH")"
printf 'startup_seconds=%s\n' "$((RESTORE_STARTED_AT - STARTED_AT))"
printf 'restore_seconds=%s\n' "$((RESTORE_FINISHED_AT - RESTORE_STARTED_AT))"
printf 'migration_seconds=%s\n' "$((MIGRATIONS_FINISHED_AT - MIGRATIONS_STARTED_AT))"
printf 'migrations_applied=%s\n' "$MIGRATIONS_APPLIED"
printf 'migrations_skipped=%s\n' "$MIGRATIONS_SKIPPED"
printf 'total_seconds=%s\n' "$((MIGRATIONS_FINISHED_AT - STARTED_AT))"

docker exec -i "$CONTAINER_NAME" psql \
  --username supabase_admin \
  --dbname "$DATABASE_NAME" \
  --variable ON_ERROR_STOP=1 \
  --tuples-only \
  --no-align \
  --field-separator '=' <<'SQL'
SELECT 'server_version', current_setting('server_version');
SELECT 'public_tables', count(*)
FROM pg_catalog.pg_tables
WHERE schemaname = 'public';
SELECT 'auth_users', count(*) FROM auth.users;
SELECT 'profiles', count(*) FROM public.profiles;
SELECT 'questions', count(*) FROM public.questions;
SELECT 'pilot_institutions', count(*) FROM public.pilot_institutions;
SELECT 'migration_146_156_count', count(*)
FROM supabase_migrations.schema_migrations
WHERE version IN ('146', '147', '148', '149', '150', '151', '152', '153', '154', '155', '156')
   OR name IN (
     '146_community_question_quality_consensus',
     '147_community_question_quality_worker_role',
     '148_community_question_quality_control_seed',
     '149_institution_critical_operation_audit',
     '150_authenticated_institution_rpc_boundary',
     '151_institution_lifecycle_control',
     '152_institution_request_ledger_retention',
     '153_legacy_function_search_path_hardening',
     '154_institution_review_closure',
     '155_institution_security_review_followup',
     '156_account_export_report_privacy'
   );
SELECT 'jwt_bound_rpc',
       has_function_privilege('authenticated', 'public.get_my_pilot_institution(uuid)', 'EXECUTE')
       AND NOT has_function_privilege('anon', 'public.get_my_pilot_institution(uuid)', 'EXECUTE');
SELECT 'request_tombstone_table', to_regclass('public.institution_request_tombstones') IS NOT NULL;
SELECT 'dsar_export_service_only',
       has_function_privilege('service_role', 'public.export_account_data(uuid)', 'EXECUTE')
       AND NOT has_function_privilege('authenticated', 'public.export_account_data(uuid)', 'EXECUTE')
       AND NOT has_function_privilege('anon', 'public.export_account_data(uuid)', 'EXECUTE');
SELECT 'required_extensions', string_agg(extname, ',' ORDER BY extname)
FROM pg_catalog.pg_extension
WHERE extname IN (
  'pg_stat_statements',
  'pg_trgm',
  'pgcrypto',
  'supabase_vault',
  'unaccent',
  'uuid-ossp'
);
SQL

VALIDATION_GATE="$(docker exec -i "$CONTAINER_NAME" psql \
  --username supabase_admin \
  --dbname "$DATABASE_NAME" \
  --variable ON_ERROR_STOP=1 \
  --tuples-only \
  --no-align <<'SQL'
SELECT (
  current_setting('server_version') LIKE '17.%'
  AND (SELECT count(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public') > 0
  AND (
    SELECT count(*)
    FROM supabase_migrations.schema_migrations
    WHERE version IN ('146', '147', '148', '149', '150', '151', '152', '153', '154', '155', '156')
       OR name IN (
         '146_community_question_quality_consensus',
         '147_community_question_quality_worker_role',
         '148_community_question_quality_control_seed',
         '149_institution_critical_operation_audit',
         '150_authenticated_institution_rpc_boundary',
         '151_institution_lifecycle_control',
         '152_institution_request_ledger_retention',
         '153_legacy_function_search_path_hardening',
         '154_institution_review_closure',
         '155_institution_security_review_followup',
         '156_account_export_report_privacy'
       )
  ) = 11
  AND has_function_privilege('authenticated', 'public.get_my_pilot_institution(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.get_my_pilot_institution(uuid)', 'EXECUTE')
  AND to_regclass('public.institution_request_tombstones') IS NOT NULL
  AND has_function_privilege('service_role', 'public.export_account_data(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.export_account_data(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.export_account_data(uuid)', 'EXECUTE')
  AND (
    SELECT count(*)
    FROM pg_catalog.pg_extension
    WHERE extname IN (
      'pg_stat_statements',
      'pg_trgm',
      'pgcrypto',
      'supabase_vault',
      'unaccent',
      'uuid-ossp'
    )
  ) = 6
)::text;
SQL
)"

if [[ "$VALIDATION_GATE" != "true" ]]; then
  printf 'status=failed\nreason=security_contract_validation\n' >&2
  exit 10
fi

printf 'status=passed\n'
printf 'cleanup=automatic\n'
