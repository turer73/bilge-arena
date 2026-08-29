# Institution program and Mastery integrity release 201-204

This release turns institution study-program cards into server-bound execution
targets, separates diagnostic observations from normal mastery evidence, gates
public Mastery scores on distinct Turkey calendar days, and blocks tombstoned
profiles at both the Next.js and PostgREST Data API boundaries.

It does **not** prove psychometric validity, a causal program effect, an
official MEB outcome diagnosis, or a successful institution pilot. The current
taxonomy remains a broad category proxy. PostgREST `db_pre_request` covers the
Data API only; Realtime, Storage, Auth-principal erasure and processor retention
remain separate controls.

## Non-negotiable release state

- Keep `INSTITUTION_PILOT_ENABLED`, `INSTITUTION_ONBOARDING_ENABLED`,
  `INSTITUTION_FREE_PILOT_ENABLED`, `INSTITUTION_TRACKING_ENABLED`,
  `NEXT_PUBLIC_INSTITUTION_TRACKING_ENABLED` and
  `INSTITUTION_STUDY_PROGRAM_ENABLED` false in Preview and Production.
- Do not merge, deploy or mutate production from a local green test. Record
  exact approval for the commit, repository, branch, PR merge/deploy and
  migration ordinals.
- PostgreSQL 16 CI for migrations 201, 202, 203 and 204 is mandatory. A skipped
  local suite is not acceptance evidence.
- Apply migrations one at a time. Stop on any SQL error, timeout, failed
  migration-local postcheck, schema drift or unexpected capability state.
- Do not enable physical account purge. Migration 203 intentionally disables
  the legacy purge RPC and exposes only a bounded, no-PII preview.

## Verified production baseline — 2026-08-29

A read-only service-role/Data API check against production found:

- `resolve_released_curriculum_scope('matematik','TYT')` resolves
  `ba-tyt-math-v1` with its diagnostic enabled.
- `resolve_released_curriculum_scope('fen','TYT')` resolves `ba-tyt-fen-v1`;
  its diagnostic is still disabled.
- Turkish/TYT, Social/TYT and Wordquest/YDT resolvers return SQL/JSON null.
- `institution_scope_capabilities` and
  `institution_study_program_item_executions` are not present in the PostgREST
  schema cache.
- `user_outcome_state.verified_evidence_days` returns PostgreSQL 42703 because
  the column does not exist.

This proves that the 187-204 production chain is not complete. It does not by
itself reveal the exact migration-ledger stopping ordinal because the private
`supabase_migrations` schema is not exposed through the Data API. Refresh this
baseline and read the authoritative migration ledger in the maintenance window.

## Dependency and deployment order

1. Read the authoritative migration ledger and identify the first missing
   ordinal in 187-204. Do not infer it from a deployed app commit or Data API
   shape. Migration 201 depends on the scope/capability contracts introduced
   by 193-200, so a missing ordinal can never be skipped.
2. Run full application tests, database static tests, PostgreSQL 16 acceptance,
   migration/grant lint, type-check, lint and the production webpack build on
   the exact release commit.
3. Restore an approved pre-187 production/staging dump into a dedicated local
   PostgreSQL cluster matching the dump's source major and pass
   `npm run test:release-chain:rehearsal` as documented in
   `2026-08-29-exact-release-chain-rehearsal.md`. PostgreSQL 16 remains the
   default; PG17 requires the explicit, header-proven opt-in. Separate synthetic
   fixtures do not replace this exact same-schema gate.
4. Merge and deploy the application while every institution flag remains off.
   The Mastery reader has a bounded legacy-column fallback; institution task
   execution remains inaccessible behind the closed flags.
5. Run the production preflights below in a quiet maintenance window.
6. Starting at the ledger-proven first missing ordinal, apply every migration
   through 204 in exact order and record each migration-local postcheck. Apply
   204 last, then reload and test the Data API. Stop on the first failure.
7. Regenerate `src/types/database.generated.ts` from production with a valid,
   rotated Supabase access token. Review and commit the generated diff; never
   hand-edit the generated file.
8. Run production smoke and record the deployment SHA, migration hashes,
   timestamps, actor, results and any stop/compensation action.

Check the migration ledger before doing anything:

```sql
SELECT version::text AS version, name::text AS name
FROM supabase_migrations.schema_migrations
ORDER BY version::text;
```

If the project's migration ledger uses timestamp versions, map each exact
filename/hash through the deployment tool instead of guessing from this query.
Never skip a missing ordinal in the 187-204 chain.

## Production preflight

### 201: program/capability boundary

```sql
SELECT game, display_exam_ref, question_exam_ref, taxonomy_version,
       capability_status, student_analysis_enabled, aggregate_enabled,
       report_enabled, program_enabled
FROM public.institution_scope_capabilities
ORDER BY game, display_exam_ref;

SELECT status, count(*)
FROM public.institution_study_programs
GROUP BY status
ORDER BY status;

SELECT program.id, count(*) FILTER (WHERE item.task_type='diagnostic') AS diagnostics
FROM public.institution_study_programs AS program
JOIN public.institution_study_program_items AS item ON item.program_id=program.id
WHERE program.status='published' AND item.status='pending'
GROUP BY program.id
HAVING count(*) FILTER (WHERE item.task_type='diagnostic') > 1;
```

The last query must return zero rows. Every currently published program must
resolve to an exact released capability snapshot. Migration 201 will fail
closed if an item cannot produce a unique category-bound target.

### 202: provenance, size and lock risk

```sql
SELECT relation.relname,
       stats.n_live_tup,
       pg_size_pretty(pg_total_relation_size(relation.oid)) AS total_size
FROM pg_class AS relation
JOIN pg_namespace AS namespace ON namespace.oid=relation.relnamespace
LEFT JOIN pg_stat_user_tables AS stats ON stats.relid=relation.oid
WHERE namespace.nspname='public'
  AND relation.relname IN (
    'verified_attempts','game_sessions','session_answers',
    'mastery_outcome_evidence','user_outcome_state'
  )
ORDER BY relation.relname;

SELECT pid, usename, state, wait_event_type, wait_event, query_start,
       left(query, 240) AS query
FROM pg_stat_activity
WHERE datname=current_database()
  AND pid<>pg_backend_pid()
  AND state<>'idle'
ORDER BY query_start;

SELECT count(*) AS invalid_legacy_provenance
FROM public.mastery_outcome_evidence AS evidence
LEFT JOIN public.verified_attempts AS attempt ON attempt.id=evidence.attempt_id
LEFT JOIN public.game_sessions AS session ON session.id=evidence.session_id
LEFT JOIN public.session_answers AS answer ON answer.id=evidence.answer_id
WHERE attempt.id IS NULL
   OR attempt.completed_at IS NULL
   OR attempt.session_id IS NULL
   OR attempt.user_id IS DISTINCT FROM evidence.user_id
   OR attempt.session_id IS DISTINCT FROM evidence.session_id
   OR NOT (evidence.question_id=ANY(attempt.question_ids))
   OR session.id IS NULL
   OR session.user_id IS DISTINCT FROM evidence.user_id
   OR answer.id IS NULL
   OR answer.user_id IS DISTINCT FROM evidence.user_id
   OR answer.session_id IS DISTINCT FROM evidence.session_id
   OR answer.question_id IS DISTINCT FROM evidence.question_id
   OR coalesce(answer.is_skipped,false);
```

`invalid_legacy_provenance` must be zero. Migration 202 uses a 10-second lock
timeout and 15-minute statement timeout; either timeout is a stop condition.
Do not raise the bounds during the incident. Measure the tables and retry in a
quieter window after review.

### 203: retention and legacy cron

```sql
SELECT count(*) AS legacy_30_day_candidates
FROM public.profiles
WHERE deleted_at < clock_timestamp()-interval '30 days';

SELECT to_regclass('cron.job') AS cron_job_relation;
```

If `cron_job_relation` is non-null, run:

```sql
SELECT jobid, schedule, command, active
FROM cron.job
WHERE command ILIKE '%hard_delete_expired_users%';
```

Disable and record any matching external job before 203. The repository does
not schedule one, but an out-of-band job would otherwise begin failing with
SQLSTATE 55000 after the intentionally fail-closed migration.

### 204: existing Data API hook

```sql
SELECT role_config
FROM pg_roles AS role_row,
     LATERAL unnest(coalesce(role_row.rolconfig,ARRAY[]::text[])) AS role_config
WHERE role_row.rolname='authenticator'
  AND role_config LIKE 'pgrst.db_pre_request=%';
```

Zero rows or the exact existing value
`pgrst.db_pre_request=public.enforce_active_profile_data_api_request` is
acceptable. Any other hook is a stop condition: compose both policies in one
reviewed function and a new forward migration rather than overwriting it.

## Postchecks

Migration-local postchecks already abort each transaction. Record their output
and also run these independent checks after every successful commit:

```sql
-- 201
SELECT count(*) AS open_executions
FROM public.institution_study_program_item_executions
WHERE status='started' AND expires_at>clock_timestamp();

SELECT
  has_function_privilege(
    'authenticated',
    'public.get_institution_student_reports_v2(uuid,uuid,text,text,text)',
    'EXECUTE'
  ) AS authenticated_direct_report_access,
  has_function_privilege(
    'service_role',
    'public.get_institution_student_reports_v2(uuid,uuid,text,text,text)',
    'EXECUTE'
  ) AS service_report_access;
-- Required result: authenticated_direct_report_access=false,
-- service_report_access=true.

DO $check$
DECLARE
  v_program record;
BEGIN
  FOR v_program IN
    SELECT program.id
    FROM public.institution_study_programs AS program
    WHERE program.status='published'
  LOOP
    PERFORM public.assert_institution_program_startable(v_program.id);
  END LOOP;
END
$check$;

-- 202
SELECT count(*) AS aggregate_mismatch
FROM public.user_outcome_state AS state
WHERE state.verified_evidence_days IS DISTINCT FROM (
  SELECT count(*)::integer
  FROM public.mastery_outcome_evidence_days AS evidence_day
  WHERE evidence_day.user_id=state.user_id
    AND evidence_day.outcome_id=state.outcome_id
);

SELECT count(*) AS source_mismatch
FROM public.mastery_outcome_evidence_days AS evidence_day
LEFT JOIN public.mastery_outcome_evidence AS evidence
  ON evidence.answer_id=evidence_day.first_answer_id
 AND evidence.outcome_id=evidence_day.outcome_id
WHERE evidence.answer_id IS NULL
   OR evidence.user_id IS DISTINCT FROM evidence_day.user_id
   OR evidence.attempt_id IS DISTINCT FROM evidence_day.first_attempt_id
   OR evidence.question_id IS DISTINCT FROM evidence_day.first_question_id
   OR evidence.verified_completed_at IS DISTINCT FROM evidence_day.first_verified_completed_at
   OR evidence.evidence_day_tr IS DISTINCT FROM evidence_day.evidence_day_tr;

-- 204
SELECT role_config
FROM pg_roles AS role_row,
     LATERAL unnest(coalesce(role_row.rolconfig,ARRAY[]::text[])) AS role_config
WHERE role_row.rolname='authenticator'
  AND role_config LIKE 'pgrst.db_pre_request=%';
```

Both 202 mismatch counts must be zero. For 203, run the preview only as the
service role and retain only its aggregate JSON, never profile identifiers:

```sql
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.preview_expired_account_retention(25);
ROLLBACK;
```

The result must say `physicalPurgeEnabled=false` and
`legalDecisionRequired=true`. This is not approval to delete anything.

## Production smoke matrix

- Anonymous Arena and health surfaces still load; no private response becomes
  cacheable.
- An active user can sign in, finish a normal quiz and receive XP/coin through
  the existing server-authoritative session path.
- An AAL1 administrator is stopped; AAL2 opens the admin and question
  governance surfaces. Direct PostgREST calls cannot bypass their database
  authorization.
- A controlled tombstoned test profile receives 410 from the Data API and sees
  the closed-profile notice at `/giris`; an active profile still succeeds. Do
  not tombstone a real user to manufacture this smoke.
- Mathematics and Science Mastery maps render. Turkish and internal YDT English
  render only if their exact 187-200 release/capability postchecks are green.
  Social remains absent/draft.
- Several answers on one Turkey day still expose no outcome score. Three
  distinct Turkey dates unlock only the first product evaluation; this is not
  a scientific reliability claim and there is no minimum elapsed-interval
  guarantee beyond distinct dates.
- On an approved test tenant, a learner starts a published program card, a
  pre-start attempt cannot close it, a post-start exact-scope attempt can close
  it once, and a diagnostic closes only its diagnostic task. Program review
  reports an observation and `causalClaim=false`.
- A Mathematics/TYT institution report is created and listed only under its
  exact game/exam/taxonomy/policy snapshot; its PDF and guardian draft say
  `TYT Matematik`. A report request for a released analysis scope whose
  `report_enabled` flag is false must fail closed and must never fall back to
  a Mathematics-labelled artifact. Keep all new report/program capability
  flags closed until this smoke is explicitly approved.
- Tombstoning the controlled learner makes the same report-history request
  fail with the member-not-found boundary even if its classroom membership is
  still marked active. Direct `authenticated` Data API execution of the v2
  report reader remains denied; only the AAL2/rate-limited server route may use
  its `service_role` grant.
- Mobile and desktop both expose the Mastery entry. Science never claims that a
  diagnostic is incomplete when the diagnostic capability is unavailable.

The institution task smoke requires a separately approved controlled canary
because production flags remain closed. Without that canary, report the code,
PostgreSQL fixture and deployment as complete but the real-tenant smoke as
pending; never call it live-proven.

## Containment and rollback boundary

- 201/202 are additive provenance migrations. Preserve executions, evidence and
  day ledgers. Contain with the closed application flags and ship a forward
  repair; do not delete or relabel evidence.
- 203 has no destructive mutation. Do not restore the old purge body until the
  signed retention matrix, FK plan, Auth/Storage/processor plan and first three
  human-approved dry runs exist.
- If 204 causes a confirmed Data API outage, an authorised database operator
  may temporarily run `ALTER ROLE authenticator RESET pgrst.db_pre_request;`
  followed by `NOTIFY pgrst, 'reload config';`. This reopens the direct Data API
  tombstone gap, so record it as a security incident, keep affected application
  surfaces closed and ship a reviewed composed-hook forward migration.
- Global sign-out revokes refresh sessions, but an already issued custom
  Realtime JWT may remain usable until its one-hour expiry. Migration 204 does
  not cover Realtime, Storage or Auth. Track those as a separate revocation/RLS
  control; do not claim instantaneous whole-platform erasure.
