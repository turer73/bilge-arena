-- Migration 165: ham soru/cevap arama projeksiyonunu DB seviyesinde AAL2'ye bagla.
--
-- Migration 157 cevap anahtarini public arama dalindan cikardi; fakat
-- admin_view=true yalnız admin.dashboard.view iznine bakiyordu. AAL1 admin JWT,
-- dogrudan PostgREST /rpc/search_questions ile proxy ve route AAL2 kontrolunu
-- atlayip ham content (answer/solution) okuyabiliyordu.

BEGIN;

CREATE OR REPLACE FUNCTION public.search_questions(
  search_q text DEFAULT NULL::text,
  game_filter text DEFAULT NULL::text,
  category_filter text DEFAULT NULL::text,
  difficulty_filter integer DEFAULT NULL::integer,
  active_filter boolean DEFAULT NULL::boolean,
  admin_view boolean DEFAULT false,
  result_offset integer DEFAULT 0,
  result_limit integer DEFAULT 20
)
RETURNS TABLE(
  id uuid, external_id character varying, game character varying,
  category character varying, subcategory character varying, topic character varying,
  difficulty smallint, level_tag character varying, content jsonb,
  is_active boolean, is_boss boolean, source character varying,
  exam_ref character varying, times_answered integer, times_correct integer,
  created_at timestamp with time zone, total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
BEGIN
  -- Ham cevap projeksiyonu ayricalikli okumadir. Rol tek basina yetmez; JWT
  -- AAL2 olmadan dogrudan PostgREST RPC cagrisi da fail-closed reddedilir.
  IF admin_view = TRUE THEN
    IF COALESCE(auth.jwt() ->> 'aal','aal1') <> 'aal2'
      OR auth.uid() IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.role_permissions rp ON rp.role_id = ur.role_id
        WHERE ur.user_id = auth.uid()
          AND rp.permission = 'admin.dashboard.view'
      ) THEN
      RAISE EXCEPTION 'admin_view requires aal2 admin privileges'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
    SELECT
      q.id,q.external_id,q.game,q.category,q.subcategory,q.topic,q.difficulty,
      q.level_tag,
      CASE WHEN admin_view = TRUE THEN q.content
        ELSE q.content - 'answer' - 'correct' - 'solution' - 'explanation' - 'hint'
      END AS content,
      q.is_active,q.is_boss,q.source,q.exam_ref,q.times_answered,q.times_correct,
      q.created_at,COUNT(*) OVER() AS total_count
    FROM public.questions q
    WHERE (game_filter IS NULL OR q.game = game_filter)
      AND (category_filter IS NULL OR q.category = category_filter)
      AND (difficulty_filter IS NULL OR q.difficulty = difficulty_filter)
      AND (active_filter IS NULL OR q.is_active = active_filter)
      AND (admin_view = TRUE OR q.is_active = TRUE)
      AND (
        search_q IS NULL OR search_q = ''
        OR public.immutable_unaccent(q.content->>'question')
          ILIKE public.immutable_unaccent('%' || search_q || '%')
        OR public.immutable_unaccent(q.content->>'sentence')
          ILIKE public.immutable_unaccent('%' || search_q || '%')
      )
    ORDER BY q.created_at DESC
    OFFSET GREATEST(result_offset,0)
    LIMIT LEAST(GREATEST(result_limit,1),100);
END
$fn$;

-- Public projection remains available to guests; only admin_view is AAL2-bound.
REVOKE ALL ON FUNCTION public.search_questions(text,text,text,integer,boolean,boolean,integer,integer)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.search_questions(text,text,text,integer,boolean,boolean,integer,integer)
  TO anon,authenticated;

DO $verify$
DECLARE
  v_proc record;
BEGIN
  SELECT p.prosecdef,p.proconfig,p.prosrc,owner_role.rolname AS owner_name
  INTO v_proc
  FROM pg_proc p
  JOIN pg_roles owner_role ON owner_role.oid=p.proowner
  WHERE p.oid='public.search_questions(text,text,text,integer,boolean,boolean,integer,integer)'::regprocedure;

  IF NOT FOUND OR NOT v_proc.prosecdef
    OR v_proc.owner_name NOT IN ('postgres','supabase_admin')
    OR NOT ('search_path=pg_catalog'=ANY(COALESCE(v_proc.proconfig,ARRAY[]::text[])))
    OR v_proc.prosrc !~ 'auth[.]jwt[(][)].*aal.*aal2' THEN
    RAISE EXCEPTION '165 verification: search_questions AAL2 definer contract invalid';
  END IF;
  IF NOT has_function_privilege('anon','public.search_questions(text,text,text,integer,boolean,boolean,integer,integer)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.search_questions(text,text,text,integer,boolean,boolean,integer,integer)','EXECUTE')
    OR has_function_privilege('service_role','public.search_questions(text,text,text,integer,boolean,boolean,integer,integer)','EXECUTE') THEN
    RAISE EXCEPTION '165 verification: search_questions role grants invalid';
  END IF;
END
$verify$;

COMMIT;

NOTIFY pgrst,'reload schema';
