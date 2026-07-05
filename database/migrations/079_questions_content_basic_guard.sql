-- Basic database-level guard for non-WordQuest multiple-choice content.
--
-- Codex PR#261 P2 fix: CHECK CONSTRAINT yerine BEFORE INSERT/UPDATE TRIGGER kullanılır.
-- Sebep: NOT VALID CHECK ilk tablo-taramasını atlar AMA sonraki HER UPDATE'te (içerik
-- değişmese bile, ör. admin is_active toggle) yeniden değerlendirilir → legacy-broken
-- satırların status-toggle'ı 500 verir. Trigger yalnız INSERT'te veya content GERÇEKTEN
-- DEĞİŞTİĞİNDE doğrular; is_active gibi ilgisiz update'ler serbest geçer.

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
     OR jsonb_array_length(p_content->'options') <> 5 THEN
    RETURN false;
  END IF;

  -- Codex #261: answer JSON-NUMBER olmalı. ->> string-coerce ettiğinden "2" (string)
  -- veya null da '^[0-4]$'-yolunu yanıltır; game-API strict-eq ile eşleşmez → hiçbir
  -- şık doğru render/score edilmez. jsonb_typeof ile gerçek sayı zorunlu.
  IF jsonb_typeof(p_content->'answer') IS DISTINCT FROM 'number'
     OR (p_content->>'answer') !~ '^[0-4]$' THEN
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

-- Eski NOT VALID CHECK'i kaldır (varsa) — trigger'a geçiş.
ALTER TABLE public.questions
  DROP CONSTRAINT IF EXISTS chk_questions_content_basic_guard;

-- Trigger fonksiyonu: yalnız INSERT'te veya content DEĞİŞTİĞİNDE doğrula.
-- is_active/updated_at gibi ilgisiz update'ler legacy-broken satırlarda bile serbest geçer.
CREATE OR REPLACE FUNCTION public.tg_questions_content_basic_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.content IS DISTINCT FROM OLD.content THEN
    IF NOT public.question_content_basic_guard(NEW.game, NEW.content) THEN
      RAISE EXCEPTION 'question content failed basic guard (game=%, id=%)', NEW.game, NEW.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_questions_content_basic_guard ON public.questions;
CREATE TRIGGER trg_questions_content_basic_guard
  BEFORE INSERT OR UPDATE ON public.questions
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_questions_content_basic_guard();

COMMENT ON FUNCTION public.question_content_basic_guard(text, jsonb)
  IS 'Basic content-shape/quality gate for non-WordQuest questions; enforced via BEFORE INSERT/UPDATE trigger only when content changes (legacy is_active toggles stay allowed).';
