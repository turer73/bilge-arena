#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
[[ "$(pwd -P)" == /home/klipperos/bilge-arena-academy-test/source/infra/test/klipper ]] || exit 70
[[ "$(docker compose config --format json | node -e 'let b="";process.stdin.on("data",d=>b+=d).on("end",()=>console.log(JSON.parse(b).name))')" == bilge-arena-academy-test ]] || exit 71
db() { docker compose exec -T auth-db psql -X -U postgres -d academy_game_test -v ON_ERROR_STOP=1 "$@"; }
exists=$(docker compose exec -T auth-db psql -XAt -U postgres -d postgres -c "SELECT count(*) FROM pg_database WHERE datname='academy_game_test'")
if [[ "$exists" == 0 ]]; then
  # Clone only this isolated database, retaining real test Auth identities/sessions.
  # No DROP, production connection or room database modification.
  docker compose stop auth auth-rest app
  trap 'docker compose start auth auth-rest app >/dev/null' EXIT
  docker compose exec -T auth-db psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -c 'CREATE DATABASE academy_game_test TEMPLATE academy_auth_test'
  docker compose start auth auth-rest app
  trap - EXIT
fi
if [[ "$(db -Atc "SELECT to_regclass('academy_test.migrations') IS NOT NULL")" == f ]]; then
  [[ "$(db -Atc "SELECT count(*) FROM public.profiles")" == 3 ]] || { echo 'Unexpected fixture; refusing initialization'; exit 72; }
  db -1 < game-platform.sql >/dev/null
fi
apply() {
  local file="$1" name="$2" hash old tmp
  hash=$(sha256sum "$file" | cut -d' ' -f1)
  old=$(db -Atc "SELECT sha256 FROM academy_test.migrations WHERE name='$name'")
  if [[ -n "$old" ]]; then
    [[ "$old" == "$hash" ]] || { echo "Changed applied input: $name"; exit 73; }
    return
  fi
  tmp=$(mktemp)
  # Normalize only outer transaction wrappers and concurrent index creation:
  # an empty isolated DB does not need concurrent index builds. Ledger + SQL
  # then commit atomically, allowing safe retries after any statement fails.
  sed -E '/^[[:space:]]*(BEGIN|COMMIT);[[:space:]]*$/d;s/CREATE INDEX CONCURRENTLY/CREATE INDEX/g' "$file" > "$tmp"
  if [[ "$name" == schema.sql ]]; then
    # Legacy baseline contains a backslash-escaped apostrophe in one seed row.
    sed -i "1i SET LOCAL standard_conforming_strings = off;" "$tmp"
    printf '\nINSERT INTO public.profiles (id,username,display_name,avatar_url) SELECT id,username,display_name,avatar_url FROM academy_fixture_v0.profiles;\n' >> "$tmp"
  fi
  printf "\nINSERT INTO academy_test.migrations(name,sha256) VALUES ('%s','%s');\n" "$name" "$hash" >> "$tmp"
  if ! db -1 < "$tmp" > /tmp/academy-game-migration.log 2>&1; then
    tail -12 /tmp/academy-game-migration.log
    rm -f "$tmp"
    echo "Stopped safely at $name (transaction rolled back)"
    exit 74
  fi
  rm -f "$tmp"
  echo "APPLIED $name"
}
apply ../../../database/schema.sql schema.sql
# Historical 003 policies reference profiles.role, introduced by 004.
apply ../../../database/migrations/004_add_admin_tables.sql 004_add_admin_tables.sql
while IFS= read -r -u 3 file; do
  number=$(basename "$file" | cut -c1-3)
  if (( 10#$number > 211 )); then
    echo 'New migration beyond reviewed test manifest; review required'
    exit 75
  fi
  # These curriculum/institution release families require a reviewed complete
  # bank. Synthetic gameplay fixtures are NOT that evidence. Keep their whole
  # dependency families deferred, not silently marked applied.
  if (( 10#$number >= 179 && 10#$number <= 184 || 10#$number >= 187 && 10#$number <= 202 || 10#$number >= 205 )); then
    echo "DEFERRED (not gameplay scope): $(basename "$file")"
    continue
  fi
  if [[ "$(basename "$file")" == 016b_fix_rls_recursion.sql ]]; then
    apply ../../../database/migrations/017_homepage_editor.sql 017_homepage_editor.sql
  fi
  if [[ "$(basename "$file")" == 046_select_random_questions_exam_ref.sql ]]; then
    apply game-compat-pre046.sql test-compat-pre046.sql
  fi
  if [[ "$(basename "$file")" == 106_question_content_governance.sql ]]; then
    apply game-questions.sql test-questions.sql
  fi
  if [[ "$(basename "$file")" == 090_harden_sensitive_function_execute_grants.sql ]]; then
    apply game-compat-pre090.sql test-compat-pre090.sql
  fi
  if [[ "$(basename "$file")" == 148_community_question_quality_control_seed.sql ]]; then
    apply game-compat-pre148.sql test-compat-pre148.sql
  fi
  apply "$file" "$(basename "$file")"
done 3< <(find ../../../database/migrations -maxdepth 1 -name '*.sql' | LC_ALL=C sort)
apply game-finalize.sql test-finalize.sql
apply game-auth-compat.sql test-auth-compat.sql
echo 'Gameplay schema installed in academy_game_test; curriculum release families deferred. Services have NOT been switched.'
