-- Bug2330: exam-aware LGS publication; no question/evidence data updates.
-- Only exact normalized LGS opts into four options. Unknown/NULL keeps legacy five.
-- All other 079 checks and the legacy WordQuest shape exemption remain intact.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.question_content_basic_guard_for_exam(p_game text, p_content jsonb, p_exam_ref text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  expected_options integer := CASE WHEN upper(btrim(coalesce(p_exam_ref,'')))='LGS' THEN 4 ELSE 5 END;
  opt jsonb;
  option_text text;
  body text;
  roman_count integer := 0;
  premise_like_count integer := 0;
  word_count integer := 0;
  has_comparison_option boolean := false;
  has_combination_answer boolean := false;
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
     OR jsonb_array_length(p_content->'options') <> expected_options THEN
    RETURN false;
  END IF;

  -- Codex #261: answer JSON-NUMBER olmalı. ->> string-coerce ettiğinden "2" (string)
  -- veya null da '^[0-4]$'-yolunu yanıltır; game-API strict-eq ile eşleşmez → hiçbir
  -- şık doğru render/score edilmez. jsonb_typeof ile gerçek sayı zorunlu.
  IF jsonb_typeof(p_content->'answer') IS DISTINCT FROM 'number'
     OR (p_content->>'answer') !~ '^[0-4]$'
     OR (p_content->>'answer')::integer >= expected_options THEN
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

    -- Codex #261: Türkçe büyük-İ + noktalama normalize (app-guard paritesi).
    -- translate(İ→i, I→ı) + noktalama-strip ile 'HİÇBİRİ'/'Hiçbiri.' de yakalanır.
    IF regexp_replace(lower(translate(btrim(option_text), 'İI', 'iı')), '[.,!?;:]', '', 'g') IN (
      'hiçbiri',
      'hepsi',
      'yukarıdakilerden hiçbiri',
      'yukarıdakilerin hepsi'
    ) THEN
      RETURN false;
    END IF;

    -- FP-koruma 1 (app-guard paritesi): bir şık BİRDEN FAZLA roman içeriyorsa
    -- (ör. "I. neden-sonuç, II. amaç-sonuç") bu KARŞILAŞTIRMA-CEVABIDIR (geçerli),
    -- öncül-bölünmesi değil.
    IF option_text ~* '(^|\s)(I|II|III|IV|V|VI|VII|VIII|IX|X)[.)]\s.*\y(I|II|III|IV|V|VI|VII|VIII|IX|X)[.)]\s' THEN
      has_comparison_option := true;
    END IF;

    -- FP-koruma 2 (Codex #261 paritesi): standart kombinasyon-cevap şıkkı
    -- ("Yalnız I", "I ve II", "I, II ve III"). Gerçek öncül-bölünmesinde en az bir
    -- tane bulunur; yoksa roman-prefixli şıklar bir AD-LİSTESİDİR (uzun tarihi-ad).
    IF option_text ~* '^\s*(yalnız\s+)?(I|II|III|IV|V|VI|VII|VIII|IX|X)(\s*(,|ve)\s*(I|II|III|IV|V|VI|VII|VIII|IX|X))*\s*$' THEN
      has_combination_answer := true;
    END IF;

    IF option_text ~* '^\s*(I|II|III|IV|V|VI|VII|VIII|IX|X)[.)]\s+' THEN
      roman_count := roman_count + 1;
      body := regexp_replace(option_text, '^\s*(I|II|III|IV|V|VI|VII|VIII|IX|X)[.)]\s+', '', 'i');
      word_count := coalesce(array_length(regexp_split_to_array(btrim(body), '\s+'), 1), 0);

      IF word_count >= 5
         OR body ~* '(dır|dir|dur|dür|tır|tir|tur|tür|ar|er|ır|ir|ur|ür|maz|mez|malı|meli|olur|olmaz|artar|azalır|değişir|bağlıdır|orantılıdır)\.?$' THEN
        premise_like_count := premise_like_count + 1;
      END IF;
    END IF;
  END LOOP;

  -- Öncül-bölünme reddi: yalnız gerçek bölünmede (kombinasyon-cevap VAR, karşılaştırma DEĞİL).
  IF roman_count >= 2 AND premise_like_count >= 1
     AND has_combination_answer AND NOT has_comparison_option THEN
    RETURN false;
  END IF;

  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$$;


-- Preserve the existing two-argument API and its ACL; callers without exam metadata
-- cannot silently start accepting four-option content.
CREATE OR REPLACE FUNCTION public.question_content_basic_guard(p_game text,p_content jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT public.question_content_basic_guard_for_exam(p_game,p_content,NULL::text);
$$;

CREATE OR REPLACE FUNCTION public.tg_questions_content_basic_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP='INSERT' OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.game IS DISTINCT FROM OLD.game OR NEW.exam_ref IS DISTINCT FROM OLD.exam_ref THEN
    IF NOT public.question_content_basic_guard_for_exam(NEW.game,NEW.content,NEW.exam_ref) THEN
      RAISE EXCEPTION 'question content failed basic guard (game=%, exam_ref=%, id=%)',NEW.game,NEW.exam_ref,NEW.id
        USING ERRCODE='check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Pure input-only predicate: match the existing guard's public execution contract.
-- Invoker-only: no table access, privilege escalation or trigger disabling.
GRANT EXECUTE ON FUNCTION public.question_content_basic_guard_for_exam(text,jsonb,text) TO PUBLIC;
COMMENT ON FUNCTION public.question_content_basic_guard_for_exam(text,jsonb,text)
  IS 'Pure exam-aware content gate: normalized LGS=4; all other/absent exam refs retain legacy 5; legacy WordQuest exemption unchanged.';
COMMENT ON FUNCTION public.question_content_basic_guard(text,jsonb)
  IS 'Backward-compatible five-option predicate without exam metadata; table trigger uses question_content_basic_guard_for_exam.';
COMMENT ON FUNCTION public.tg_questions_content_basic_guard()
  IS 'Validate insert/content/game/exam changes; unrelated legacy metadata toggles remain permitted.';
COMMIT;
