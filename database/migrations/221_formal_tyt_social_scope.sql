-- Migration 221: official TYT role eligibility only; no content/release writes.
-- Source: 2026 OSYM YKS guide, Table 1A (PDF p50 / printed p46).
-- CLI-generated skeleton numbered to match this repository's ledger.
-- The separate four-domain pilot and its RPC permissions are NOT changed.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

-- Historical role assignments cannot be silently reinterpreted.
LOCK TABLE public.curriculum_scope_releases,
  public.question_revision_exam_roles IN SHARE ROW EXCLUSIVE MODE;
DO $preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM public.curriculum_scope_releases
      WHERE game='sosyal' AND display_exam_ref='TYT' AND release_status='released')
    OR EXISTS (SELECT 1 FROM public.question_revision_exam_roles AS role
      JOIN public.question_content_revisions AS revision ON revision.id=role.revision_id
      WHERE revision.category='sosyoloji') THEN
    RAISE EXCEPTION 'formal TYT scope correction requires an unreleased scope without sociology role assignments'
      USING ERRCODE='55000';
  END IF;
END $preflight$;

CREATE OR REPLACE FUNCTION public.tyt_social_exam_role_compatible(
  p_category text, p_exam_role text
) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $fn$
  SELECT COALESCE(CASE p_exam_role
    WHEN 'common_history' THEN p_category='tarih'
    WHEN 'common_geography' THEN p_category='cografya'
    WHEN 'common_philosophy' THEN p_category='felsefe'
    WHEN 'standard_religion' THEN p_category='din_kulturu'
    WHEN 'alternate_philosophy' THEN p_category='felsefe'
    ELSE false
  END, false)
$fn$;
REVOKE ALL ON FUNCTION public.tyt_social_exam_role_compatible(text,text)
  FROM PUBLIC,anon,authenticated,service_role;

DO $postcheck$
BEGIN
  IF public.tyt_social_exam_role_compatible('sosyoloji','common_philosophy')
    OR public.tyt_social_exam_role_compatible('sosyoloji','alternate_philosophy')
    OR NOT public.tyt_social_exam_role_compatible('felsefe','alternate_philosophy') THEN
    RAISE EXCEPTION 'formal TYT scope postcheck failed';
  END IF;
END $postcheck$;
NOTIFY pgrst, 'reload schema';
COMMIT;
