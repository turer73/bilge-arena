-- Migration 203: make the legacy physical-erasure entry point fail closed.
--
-- The signed retention decision required by
-- docs/security/institution-retention-decision-record-2026-08-25.md is not
-- available.  This migration therefore does not delete, anonymise, or mutate
-- application, tenant, audit, auth, or storage data.  It provides a bounded,
-- service-only count-first preview for a human legal/operations review only.

BEGIN;

CREATE OR REPLACE FUNCTION public.hard_delete_expired_users()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION
    'hard account erasure is disabled pending a signed retention decision and processor/auth/storage deletion plan'
    USING ERRCODE = '55000';
END;
$function$;

COMMENT ON FUNCTION public.hard_delete_expired_users() IS
  'Disabled fail-closed legacy entry point. It never deletes data; use only the bounded preview until the signed retention decision authorises a reviewed purge plan.';

CREATE OR REPLACE FUNCTION public.preview_expired_account_retention(
  p_batch_size integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_profile record;
  v_fk record;
  v_processed integer := 0;
  v_auth_principals_still_present integer := 0;
  v_governance_blocked integer := 0;
  v_retained_foreign_key_blocked integer := 0;
  v_has_governance_evidence boolean;
  v_has_restrictive_reference boolean;
  v_has_reference boolean;
  v_locked boolean;
BEGIN
  IF p_batch_size IS NULL OR p_batch_size < 1 OR p_batch_size > 100 THEN
    RAISE EXCEPTION 'p_batch_size must be between 1 and 100' USING ERRCODE = '22023';
  END IF;

  -- A preview must not race another maintenance preview.  A failed lock is
  -- deliberately a zero-row result, not an unlocked best-effort scan.
  v_locked := pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('bilge_arena.account_retention.preview.v1', 0)
  );

  IF NOT v_locked THEN
    RETURN pg_catalog.jsonb_build_object(
      'legacyThresholdDays', 30,
      'processed', 0,
      'eligibleTombstones', 0,
      'authPrincipalsStillPresent', 0,
      'governanceBlocked', 0,
      'retainedForeignKeyBlocked', 0,
      'physicalPurgeEnabled', false,
      'legalDecisionRequired', true,
      'locked', false
    );
  END IF;

  FOR v_profile IN
    SELECT profile_row.id
    FROM public.profiles AS profile_row
    WHERE profile_row.deleted_at < pg_catalog.clock_timestamp() - interval '30 days'
    ORDER BY profile_row.deleted_at ASC, profile_row.id ASC
    LIMIT p_batch_size
  LOOP
    v_processed := v_processed + 1;

    IF EXISTS (SELECT 1 FROM auth.users AS auth_user WHERE auth_user.id = v_profile.id) THEN
      v_auth_principals_still_present := v_auth_principals_still_present + 1;
    END IF;

    -- Immutable question-governance evidence must never be treated as normal
    -- learner-session data.  Dynamic SQL keeps this count-only migration
    -- installable on a clean schema fixture while still failing closed when
    -- any known governance relation contains this profile.
    v_has_governance_evidence := false;
    IF pg_catalog.to_regclass('public.verified_attempts') IS NOT NULL
       AND pg_catalog.to_regclass('public.verified_attempt_question_revisions') IS NOT NULL THEN
      EXECUTE
        'SELECT EXISTS (
           SELECT 1
           FROM public.verified_attempts AS attempt_row
           JOIN public.verified_attempt_question_revisions AS revision_row
             ON revision_row.attempt_id = attempt_row.id
           WHERE attempt_row.user_id = $1
         )'
        INTO v_has_governance_evidence
        USING v_profile.id;
    END IF;

    IF NOT v_has_governance_evidence
       AND pg_catalog.to_regclass('public.question_appeals') IS NOT NULL THEN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.question_appeals WHERE user_id = $1)'
        INTO v_has_governance_evidence
        USING v_profile.id;
    END IF;

    IF NOT v_has_governance_evidence
       AND pg_catalog.to_regclass('public.question_result_corrections') IS NOT NULL THEN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.question_result_corrections WHERE user_id = $1)'
        INTO v_has_governance_evidence
        USING v_profile.id;
    END IF;

    -- Every direct NO ACTION/RESTRICT edge to profiles is a blocker for a
    -- future physical-erasure design unless that future design explicitly
    -- classifies the relation and has legal approval.  CASCADE/SET NULL edges
    -- are intentionally not blockers because they are not FK deletion stops.
    v_has_restrictive_reference := false;
    FOR v_fk IN
      SELECT
        constraint_row.conrelid::pg_catalog.regclass AS child_relation,
        attribute_row.attname AS child_column,
        pg_catalog.array_length(constraint_row.conkey, 1) AS key_count
      FROM pg_catalog.pg_constraint AS constraint_row
      LEFT JOIN pg_catalog.pg_attribute AS attribute_row
        ON attribute_row.attrelid = constraint_row.conrelid
       AND attribute_row.attnum = constraint_row.conkey[1]
       AND NOT attribute_row.attisdropped
      WHERE constraint_row.contype = 'f'
        AND constraint_row.confrelid = 'public.profiles'::pg_catalog.regclass
        AND constraint_row.confdeltype IN ('a', 'r')
    LOOP
      -- A composite or otherwise unreadable FK is a blocker rather than a
      -- reason to guess at an ownership/deletion order.
      IF v_fk.key_count <> 1 OR v_fk.child_column IS NULL THEN
        v_has_restrictive_reference := true;
        EXIT;
      END IF;

      EXECUTE pg_catalog.format(
        'SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)',
        v_fk.child_relation,
        v_fk.child_column
      )
      INTO v_has_reference
      USING v_profile.id;

      IF v_has_reference THEN
        v_has_restrictive_reference := true;
        EXIT;
      END IF;
    END LOOP;

    IF v_has_governance_evidence THEN
      v_governance_blocked := v_governance_blocked + 1;
    END IF;
    IF v_has_restrictive_reference THEN
      v_retained_foreign_key_blocked := v_retained_foreign_key_blocked + 1;
    END IF;
  END LOOP;

  -- eligibleTombstones means only "matches the legacy 30-day candidate
  -- predicate".  It does not grant authority for a physical deletion.
  RETURN pg_catalog.jsonb_build_object(
    'legacyThresholdDays', 30,
    'processed', v_processed,
    'eligibleTombstones', v_processed,
    'authPrincipalsStillPresent', v_auth_principals_still_present,
    'governanceBlocked', v_governance_blocked,
    'retainedForeignKeyBlocked', v_retained_foreign_key_blocked,
    'physicalPurgeEnabled', false,
    'legalDecisionRequired', true,
    'locked', true
  );
END;
$function$;

COMMENT ON FUNCTION public.preview_expired_account_retention(integer) IS
  'Service-only, bounded, no-PII dry run. The 30-day value is a legacy candidate-count threshold, not an approved retention period or physical purge authority.';

REVOKE ALL ON FUNCTION public.hard_delete_expired_users() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_expired_account_retention(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hard_delete_expired_users() TO service_role;
GRANT EXECUTE ON FUNCTION public.preview_expired_account_retention(integer) TO service_role;

DO $postcheck$
DECLARE
  v_hard_delete_config text[];
  v_preview_config text[];
BEGIN
  IF pg_catalog.has_function_privilege('anon', 'public.hard_delete_expired_users()', 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'public.hard_delete_expired_users()', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', 'public.hard_delete_expired_users()', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.preview_expired_account_retention(integer)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'public.preview_expired_account_retention(integer)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', 'public.preview_expired_account_retention(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'retention maintenance RPC grants are not service-role-only';
  END IF;

  SELECT procedure_row.proconfig
    INTO v_hard_delete_config
    FROM pg_catalog.pg_proc AS procedure_row
   WHERE procedure_row.oid = 'public.hard_delete_expired_users()'::pg_catalog.regprocedure;
  SELECT procedure_row.proconfig
    INTO v_preview_config
    FROM pg_catalog.pg_proc AS procedure_row
   WHERE procedure_row.oid = 'public.preview_expired_account_retention(integer)'::pg_catalog.regprocedure;

  IF NOT ('search_path=pg_catalog' = ANY(COALESCE(v_hard_delete_config, ARRAY[]::text[])))
     OR NOT ('search_path=pg_catalog' = ANY(COALESCE(v_preview_config, ARRAY[]::text[]))) THEN
    RAISE EXCEPTION 'retention maintenance RPC search_path is not hardened';
  END IF;
END;
$postcheck$;

-- The preview RPC is exposed only to service_role, but PostgREST still needs
-- its schema cache refreshed before the new signature can be invoked.
NOTIFY pgrst, 'reload schema';

COMMIT;
