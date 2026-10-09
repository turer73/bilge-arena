-- Explicit, owner-authorized basic onboarding for the bounded free pilot.
-- Comprehensive readiness remains the default. This migration opens no gate,
-- creates no institution, and does not attest to missing legal/security evidence.
BEGIN;

ALTER TABLE public.institution_pilot_control_events
  ADD COLUMN IF NOT EXISTS onboarding_mode text NOT NULL DEFAULT 'comprehensive';
ALTER TABLE public.institution_pilot_control_events
  DROP CONSTRAINT IF EXISTS institution_control_onboarding_mode_check;
ALTER TABLE public.institution_pilot_control_events
  ADD CONSTRAINT institution_control_onboarding_mode_check CHECK (
    onboarding_mode = 'comprehensive'
    OR (onboarding_mode = 'basic' AND control_key = 'free_provisioning'
      AND readiness_ref IS NULL)
  );
COMMENT ON COLUMN public.institution_pilot_control_events.onboarding_mode IS
  'Owner-approved provisioning policy, not a claim that legal/security evidence exists. Basic is free-pilot only.';

CREATE OR REPLACE FUNCTION public.audit_institution_pilot_control_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
DECLARE
  v_change_reference text := upper(btrim(current_setting('app.institution_control_change_ref', true)));
  v_readiness_ref text := upper(btrim(current_setting('app.institution_readiness_ref', true)));
  v_mode text := coalesce(nullif(btrim(current_setting('app.institution_onboarding_mode', true)), ''), 'comprehensive');
BEGIN
  NEW.updated_at := clock_timestamp();
  IF NEW.enabled IS NOT DISTINCT FROM OLD.enabled THEN RETURN NEW; END IF;
  IF v_change_reference IS NULL OR v_change_reference !~ '^[A-Z0-9][A-Z0-9._/-]{5,63}$' THEN
    RAISE EXCEPTION 'institution pilot control change reference required' USING ERRCODE = '22023';
  END IF;
  IF v_mode NOT IN ('basic', 'comprehensive') THEN
    RAISE EXCEPTION 'invalid institution onboarding mode' USING ERRCODE = '22023';
  END IF;
  IF NEW.control_key = 'free_provisioning' AND NEW.enabled THEN
    IF v_mode = 'comprehensive' THEN
      IF v_readiness_ref IS NULL OR v_readiness_ref !~ '^[A-Z0-9][A-Z0-9._/-]{5,63}$' THEN
        RAISE EXCEPTION 'free pilot readiness attestation required' USING ERRCODE = '55000';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.institution_free_pilot_readiness_attestations a
        WHERE a.readiness_ref = v_readiness_ref AND a.valid_until > clock_timestamp()
      ) OR EXISTS (
        SELECT 1 FROM public.institution_free_pilot_readiness_consumptions c
        WHERE c.readiness_ref = v_readiness_ref
      ) THEN
        RAISE EXCEPTION 'free pilot readiness attestation missing, expired or consumed' USING ERRCODE = '55000';
      END IF;
    ELSE
      -- Do not reuse or manufacture a comprehensive evidence reference.
      v_readiness_ref := NULL;
    END IF;
  ELSE
    -- Closing is always possible with an audit reference. Commercial never
    -- inherits the basic free-pilot exception.
    v_mode := 'comprehensive';
    v_readiness_ref := NULL;
  END IF;
  INSERT INTO public.institution_pilot_control_events(
    control_key, previous_enabled, enabled, change_reference,
    readiness_ref, database_actor, onboarding_mode
  ) VALUES (
    NEW.control_key, OLD.enabled, NEW.enabled, v_change_reference,
    v_readiness_ref, session_user, v_mode
  );
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.audit_institution_pilot_control_change()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_institution_provisioning_control()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
DECLARE
  v_control_key text;
  v_enabled boolean;
  v_event public.institution_pilot_control_events%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.pilot_kind IS DISTINCT FROM OLD.pilot_kind THEN
      RAISE EXCEPTION 'institution pilot kind is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.pilot_kind = 'legacy' THEN RETURN NEW; END IF;
  v_control_key := CASE NEW.pilot_kind
    WHEN 'invitation_free' THEN 'free_provisioning'
    WHEN 'commercial' THEN 'commercial_provisioning' END;
  SELECT enabled INTO v_enabled FROM public.institution_pilot_controls
  WHERE control_key = v_control_key FOR UPDATE;
  IF NOT FOUND OR v_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'institution provisioning database gate is closed' USING ERRCODE = '55000';
  END IF;
  IF NEW.pilot_kind = 'invitation_free' THEN
    -- Only persisted owner approval is trusted, never a caller's session setting.
    SELECT * INTO v_event FROM public.institution_pilot_control_events
    WHERE control_key = 'free_provisioning' ORDER BY changed_at DESC, id DESC LIMIT 1;
    IF NOT FOUND OR v_event.enabled IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'free pilot opening approval is missing' USING ERRCODE = '55000';
    END IF;
    IF v_event.onboarding_mode = 'comprehensive' THEN
      IF v_event.readiness_ref IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.institution_free_pilot_readiness_attestations a
        WHERE a.readiness_ref = v_event.readiness_ref AND a.valid_until > clock_timestamp()
      ) OR EXISTS (
        SELECT 1 FROM public.institution_free_pilot_readiness_consumptions c
        WHERE c.readiness_ref = v_event.readiness_ref
      ) THEN
        RAISE EXCEPTION 'free pilot readiness gate is missing, expired or consumed' USING ERRCODE = '55000';
      END IF;
    ELSIF v_event.onboarding_mode IS DISTINCT FROM 'basic' THEN
      RAISE EXCEPTION 'invalid free pilot opening policy' USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.enforce_institution_provisioning_control()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_free_pilot_readiness()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $fn$
DECLARE
  v_event public.institution_pilot_control_events%ROWTYPE;
BEGIN
  IF NEW.pilot_kind <> 'invitation_free' THEN RETURN NEW; END IF;
  -- The BEFORE trigger holds the control row lock until this transaction ends.
  SELECT * INTO v_event FROM public.institution_pilot_control_events
  WHERE control_key = 'free_provisioning' ORDER BY changed_at DESC, id DESC LIMIT 1;
  IF NOT FOUND OR v_event.enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'free pilot opening approval is unavailable' USING ERRCODE = '55000';
  END IF;
  IF v_event.onboarding_mode = 'basic' THEN RETURN NEW; END IF;
  IF v_event.onboarding_mode IS DISTINCT FROM 'comprehensive'
    OR v_event.readiness_ref IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.institution_free_pilot_readiness_attestations a
      WHERE a.readiness_ref = v_event.readiness_ref AND a.valid_until > clock_timestamp()
    ) THEN
    RAISE EXCEPTION 'free pilot readiness gate is unavailable' USING ERRCODE = '55000';
  END IF;
  INSERT INTO public.institution_free_pilot_readiness_consumptions(readiness_ref, institution_id)
  VALUES (v_event.readiness_ref, NEW.id);
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.consume_free_pilot_readiness()
FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
