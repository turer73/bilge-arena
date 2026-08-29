-- Migration 184: serialize adaptive diagnostic writes with the release registry.
--
-- Application capability checks improve the response shown to the learner, but
-- they cannot protect direct RPC calls or a release change between check and
-- mutation. These insert gates take a shared lock on the exact supported scope
-- and hold it through the surrounding diagnostic transaction.

BEGIN;

CREATE OR REPLACE FUNCTION public.tg_require_adaptive_diagnostic_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  PERFORM 1
  FROM public.curriculum_scope_releases AS scope
  WHERE scope.game = 'matematik'
    AND scope.display_exam_ref = 'TYT'
    AND scope.question_exam_ref = 'TYT'
    AND scope.taxonomy_version = 'ba-tyt-math-v1'
    AND scope.release_status = 'released'
    AND scope.diagnostic_enabled
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'adaptive diagnostic is unavailable for the exact released scope'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS aaa_adaptive_diagnostic_session_release_gate
  ON public.adaptive_diagnostic_sessions;
CREATE TRIGGER aaa_adaptive_diagnostic_session_release_gate
  BEFORE INSERT ON public.adaptive_diagnostic_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_require_adaptive_diagnostic_release();

DROP TRIGGER IF EXISTS aaa_adaptive_diagnostic_answer_release_gate
  ON public.adaptive_diagnostic_answers;
CREATE TRIGGER aaa_adaptive_diagnostic_answer_release_gate
  BEFORE INSERT ON public.adaptive_diagnostic_answers
  FOR EACH ROW EXECUTE FUNCTION public.tg_require_adaptive_diagnostic_release();

REVOKE ALL ON FUNCTION public.tg_require_adaptive_diagnostic_release()
  FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
