-- Migration 167: require fresh, non-PII readiness evidence before opening the
-- invitation-only institution canary provisioning gate.
--
-- This migration deliberately creates no attestation and opens no control.
-- Existing institution access is unaffected; only future free provisioning is
-- guarded. A readiness package is append-only, short-lived and single-use.

BEGIN;

CREATE TABLE IF NOT EXISTS public.institution_free_pilot_readiness_attestations (
  readiness_ref text PRIMARY KEY
    CHECK (readiness_ref ~ '^[A-Z0-9][A-Z0-9._/-]{5,63}$'),
  legal_approval_ref text NOT NULL
    CHECK (legal_approval_ref ~ '^[A-Z0-9][A-Z0-9._/-]{5,63}$'),
  institution_dpa_ref text NOT NULL
    CHECK (institution_dpa_ref ~ '^[A-Z0-9][A-Z0-9._/-]{5,63}$'),
  retention_decision_ref text NOT NULL
    CHECK (retention_decision_ref ~ '^[A-Z0-9][A-Z0-9._/-]{5,63}$'),
  vendor_register_ref text NOT NULL
    CHECK (vendor_register_ref ~ '^[A-Z0-9][A-Z0-9._/-]{5,63}$'),
  tenant_ab_evidence_ref text NOT NULL
    CHECK (tenant_ab_evidence_ref ~ '^[A-Z0-9][A-Z0-9._/-]{5,63}$'),
  credential_rotation_ref text NOT NULL
    CHECK (credential_rotation_ref ~ '^[A-Z0-9][A-Z0-9._/-]{5,63}$'),
  backup_restore_ref text NOT NULL
    CHECK (backup_restore_ref ~ '^[A-Z0-9][A-Z0-9._/-]{5,63}$'),
  account_readiness_ref text NOT NULL
    CHECK (account_readiness_ref ~ '^[A-Z0-9][A-Z0-9._/-]{5,63}$'),
  accountable_owner_ref text NOT NULL
    CHECK (accountable_owner_ref ~ '^[A-Z0-9][A-Z0-9._/-]{5,63}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  valid_until timestamptz NOT NULL,
  database_actor text NOT NULL DEFAULT session_user,
  CHECK (
    valid_until > created_at
    AND valid_until <= created_at + interval '7 days'
  )
);

COMMENT ON TABLE public.institution_free_pilot_readiness_attestations IS
  'Append-only non-PII references proving free-canary readiness; no legal document, name, email, token or personal data belongs here.';

ALTER TABLE public.institution_free_pilot_readiness_attestations
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.institution_free_pilot_readiness_attestations
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.protect_free_pilot_readiness_attestation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'free pilot readiness attestations are append-only'
      USING ERRCODE = '42501';
  END IF;

  NEW.readiness_ref := upper(btrim(NEW.readiness_ref));
  NEW.legal_approval_ref := upper(btrim(NEW.legal_approval_ref));
  NEW.institution_dpa_ref := upper(btrim(NEW.institution_dpa_ref));
  NEW.retention_decision_ref := upper(btrim(NEW.retention_decision_ref));
  NEW.vendor_register_ref := upper(btrim(NEW.vendor_register_ref));
  NEW.tenant_ab_evidence_ref := upper(btrim(NEW.tenant_ab_evidence_ref));
  NEW.credential_rotation_ref := upper(btrim(NEW.credential_rotation_ref));
  NEW.backup_restore_ref := upper(btrim(NEW.backup_restore_ref));
  NEW.account_readiness_ref := upper(btrim(NEW.account_readiness_ref));
  NEW.accountable_owner_ref := upper(btrim(NEW.accountable_owner_ref));
  NEW.created_at := clock_timestamp();
  NEW.database_actor := session_user;

  IF NEW.valid_until <= NEW.created_at
    OR NEW.valid_until > NEW.created_at + interval '7 days' THEN
    RAISE EXCEPTION 'free pilot readiness validity must be within seven days'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS institution_free_pilot_readiness_immutable
  ON public.institution_free_pilot_readiness_attestations;
CREATE TRIGGER institution_free_pilot_readiness_immutable
BEFORE INSERT OR UPDATE OR DELETE
ON public.institution_free_pilot_readiness_attestations
FOR EACH ROW EXECUTE FUNCTION public.protect_free_pilot_readiness_attestation();

REVOKE ALL ON FUNCTION public.protect_free_pilot_readiness_attestation()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.institution_free_pilot_readiness_consumptions (
  readiness_ref text PRIMARY KEY
    REFERENCES public.institution_free_pilot_readiness_attestations(readiness_ref)
    ON DELETE RESTRICT,
  institution_id uuid NOT NULL UNIQUE
    REFERENCES public.pilot_institutions(id) ON DELETE RESTRICT,
  consumed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  database_actor text NOT NULL DEFAULT session_user
);

COMMENT ON TABLE public.institution_free_pilot_readiness_consumptions IS
  'Immutable one-shot binding between a readiness package and the free institution it authorized.';

ALTER TABLE public.institution_free_pilot_readiness_consumptions
  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.institution_free_pilot_readiness_consumptions
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.protect_free_pilot_readiness_consumption()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'free pilot readiness consumptions are immutable'
      USING ERRCODE = '42501';
  END IF;
  NEW.consumed_at := clock_timestamp();
  NEW.database_actor := session_user;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS institution_free_pilot_readiness_consumption_immutable
  ON public.institution_free_pilot_readiness_consumptions;
CREATE TRIGGER institution_free_pilot_readiness_consumption_immutable
BEFORE INSERT OR UPDATE OR DELETE
ON public.institution_free_pilot_readiness_consumptions
FOR EACH ROW EXECUTE FUNCTION public.protect_free_pilot_readiness_consumption();

REVOKE ALL ON FUNCTION public.protect_free_pilot_readiness_consumption()
FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.institution_pilot_control_events
  ADD COLUMN IF NOT EXISTS readiness_ref text
    REFERENCES public.institution_free_pilot_readiness_attestations(readiness_ref)
    ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS institution_control_free_readiness_once
  ON public.institution_pilot_control_events(readiness_ref)
  WHERE control_key = 'free_provisioning'
    AND enabled
    AND readiness_ref IS NOT NULL;

-- Preserve the existing change-reference audit contract and add a fresh,
-- unconsumed readiness package only for false -> true free-control changes.
CREATE OR REPLACE FUNCTION public.audit_institution_pilot_control_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_change_reference text := upper(btrim(
    current_setting('app.institution_control_change_ref', true)
  ));
  v_readiness_ref text := upper(btrim(
    current_setting('app.institution_readiness_ref', true)
  ));
BEGIN
  NEW.updated_at := clock_timestamp();
  IF NEW.enabled IS NOT DISTINCT FROM OLD.enabled THEN
    RETURN NEW;
  END IF;
  IF v_change_reference IS NULL
    OR v_change_reference !~ '^[A-Z0-9][A-Z0-9._/-]{5,63}$' THEN
    RAISE EXCEPTION 'institution pilot control change reference required'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.control_key = 'free_provisioning'
    AND OLD.enabled IS DISTINCT FROM true
    AND NEW.enabled THEN
    IF v_readiness_ref IS NULL
      OR v_readiness_ref !~ '^[A-Z0-9][A-Z0-9._/-]{5,63}$' THEN
      RAISE EXCEPTION 'free pilot readiness attestation required'
        USING ERRCODE = '55000';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.institution_free_pilot_readiness_attestations AS attestation
      WHERE attestation.readiness_ref = v_readiness_ref
        AND attestation.valid_until > clock_timestamp()
    ) OR EXISTS (
      SELECT 1
      FROM public.institution_free_pilot_readiness_consumptions AS consumption
      WHERE consumption.readiness_ref = v_readiness_ref
    ) THEN
      RAISE EXCEPTION 'free pilot readiness attestation missing, expired or consumed'
        USING ERRCODE = '55000';
    END IF;
  ELSE
    v_readiness_ref := NULL;
  END IF;

  INSERT INTO public.institution_pilot_control_events(
    control_key,
    previous_enabled,
    enabled,
    change_reference,
    readiness_ref,
    database_actor
  ) VALUES (
    NEW.control_key,
    OLD.enabled,
    NEW.enabled,
    v_change_reference,
    v_readiness_ref,
    session_user
  );
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.audit_institution_pilot_control_change()
FROM PUBLIC, anon, authenticated, service_role;

-- Recreate the provisioning guard so direct RPC and privileged/manual INSERT
-- both require the current readiness package. Commercial provisioning keeps
-- its existing independent kill switch and is otherwise unchanged.
CREATE OR REPLACE FUNCTION public.enforce_institution_provisioning_control()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_control_key text;
  v_enabled boolean;
  v_readiness_ref text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.pilot_kind IS DISTINCT FROM OLD.pilot_kind THEN
      RAISE EXCEPTION 'institution pilot kind is immutable'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.pilot_kind = 'legacy' THEN
    RETURN NEW;
  END IF;

  v_control_key := CASE NEW.pilot_kind
    WHEN 'invitation_free' THEN 'free_provisioning'
    WHEN 'commercial' THEN 'commercial_provisioning'
  END;

  SELECT control.enabled
  INTO v_enabled
  FROM public.institution_pilot_controls AS control
  WHERE control.control_key = v_control_key
  FOR UPDATE;

  IF NOT FOUND OR v_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'institution provisioning database gate is closed'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.pilot_kind = 'invitation_free' THEN
    SELECT current_event.readiness_ref
    INTO v_readiness_ref
    FROM (
      SELECT event.enabled, event.readiness_ref
      FROM public.institution_pilot_control_events AS event
      WHERE event.control_key = 'free_provisioning'
      ORDER BY event.changed_at DESC, event.id DESC
      LIMIT 1
    ) AS current_event
    JOIN public.institution_free_pilot_readiness_attestations AS attestation
      ON attestation.readiness_ref = current_event.readiness_ref
      AND attestation.valid_until > clock_timestamp()
    WHERE current_event.enabled
      AND current_event.readiness_ref IS NOT NULL;

    IF v_readiness_ref IS NULL OR EXISTS (
      SELECT 1
      FROM public.institution_free_pilot_readiness_consumptions AS consumption
      WHERE consumption.readiness_ref = v_readiness_ref
    ) THEN
      RAISE EXCEPTION 'free pilot readiness gate is missing, expired or consumed'
        USING ERRCODE = '55000';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.enforce_institution_provisioning_control()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_free_pilot_readiness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_readiness_ref text;
BEGIN
  IF NEW.pilot_kind <> 'invitation_free' THEN
    RETURN NEW;
  END IF;

  SELECT current_event.readiness_ref
  INTO v_readiness_ref
  FROM (
    SELECT event.enabled, event.readiness_ref
    FROM public.institution_pilot_control_events AS event
    WHERE event.control_key = 'free_provisioning'
    ORDER BY event.changed_at DESC, event.id DESC
    LIMIT 1
  ) AS current_event
  JOIN public.institution_free_pilot_readiness_attestations AS attestation
    ON attestation.readiness_ref = current_event.readiness_ref
    AND attestation.valid_until > clock_timestamp()
  WHERE current_event.enabled
    AND current_event.readiness_ref IS NOT NULL;

  IF v_readiness_ref IS NULL THEN
    RAISE EXCEPTION 'free pilot readiness gate is unavailable'
      USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.institution_free_pilot_readiness_consumptions(
    readiness_ref, institution_id
  ) VALUES (
    v_readiness_ref, NEW.id
  );
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS institution_free_pilot_readiness_consume
  ON public.pilot_institutions;
CREATE TRIGGER institution_free_pilot_readiness_consume
AFTER INSERT ON public.pilot_institutions
FOR EACH ROW EXECUTE FUNCTION public.consume_free_pilot_readiness();

REVOKE ALL ON FUNCTION public.consume_free_pilot_readiness()
FROM PUBLIC, anon, authenticated, service_role;

-- A migration retry or an unexpectedly open production control fails closed.
-- This does not suspend or otherwise change any existing institution.
SELECT set_config(
  'app.institution_control_change_ref',
  'MIGRATION-167-READINESS-GATE-' || txid_current()::text,
  true
);
UPDATE public.institution_pilot_controls
SET enabled = false
WHERE control_key = 'free_provisioning'
  AND enabled;

NOTIFY pgrst, 'reload schema';
COMMIT;
