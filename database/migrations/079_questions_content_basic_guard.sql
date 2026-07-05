-- Basic database-level guard for non-WordQuest multiple-choice content.
-- NOT VALID keeps legacy rows untouched while protecting new inserts/updates.

CREATE OR REPLACE FUNCTION public.question_content_basic_guard(p_game text, p_content jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  opt jsonb;
  option_text text;
  body text;
  roman_count integer := 0;
  premise_like_count integer := 0;
  word_count integer := 0;
BEGIN
  -- WordQuest has legacy nested shapes (cloze/dialogue/sentence). Application
  -- guards still validate AI-generated WordQuest; this DB guard protects the
  -- standard TYT-style question schema without breaking legacy WQ seed data.
  IF p_game = 'wordquest' THEN
    RETURN true;
  END IF;

  IF jsonb_typeof(p_content) IS DISTINCT FROM 'object' THEN
    RETURN false;
  END IF;

  IF length(coalesce(p_content->>'question', '')) NOT BETWEEN 10 AND 4000 THEN
    RETURN false;
  END IF;

  IF jsonb_typeof(p_content->'options') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_content->'options') <> 5 THEN
    RETURN false;
  END IF;

  IF NOT (p_content ? 'answer') OR (p_content->>'answer') !~ '^[0-4]$' THEN
    RETURN false;
  END IF;

  IF length(coalesce(p_content->>'solution', '')) NOT BETWEEN 5 AND 3000 THEN
    RETURN false;
  END IF;

  FOR opt IN SELECT value FROM jsonb_array_elements(p_content->'options') LOOP
    IF jsonb_typeof(opt) IS DISTINCT FROM 'string' THEN
      RETURN false;
    END IF;

    option_text := opt #>> '{}';
    IF length(option_text) NOT BETWEEN 1 AND 600 THEN
      RETURN false;
    END IF;

    IF lower(btrim(option_text)) IN (
      'hiçbiri',
      'hepsi',
      'yukarıdakilerden hiçbiri',
      'yukarıdakilerin hepsi'
    ) THEN
      RETURN false;
    END IF;

    IF option_text ~* '^\s*(I|II|III|IV|V|VI|VII|VIII|IX|X)\.\s+' THEN
      roman_count := roman_count + 1;
      body := regexp_replace(option_text, '^\s*(I|II|III|IV|V|VI|VII|VIII|IX|X)\.\s+', '', 'i');
      word_count := coalesce(array_length(regexp_split_to_array(btrim(body), '\s+'), 1), 0);

      IF word_count >= 5
         OR body ~* '(dır|dir|dur|dür|tır|tir|tur|tür|ar|er|ır|ir|ur|ür|maz|mez|malı|meli|olur|olmaz|artar|azalır|değişir|bağlıdır|orantılıdır)\.?$' THEN
        premise_like_count := premise_like_count + 1;
      END IF;
    END IF;
  END LOOP;

  IF roman_count >= 2 AND premise_like_count >= 1 THEN
    RETURN false;
  END IF;

  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$$;

ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS chk_questions_content_basic_guard;

ALTER TABLE public.questions
  ADD CONSTRAINT chk_questions_content_basic_guard
  CHECK (public.question_content_basic_guard(game, content)) NOT VALID;

COMMENT ON FUNCTION public.question_content_basic_guard(text, jsonb)
  IS 'Basic DB-side quality gate for non-WordQuest question content shape, forbidden catch-all options, and premise-in-options leakage.';
