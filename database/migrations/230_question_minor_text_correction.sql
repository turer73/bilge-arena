-- Migration 230: Kucuk metin duzeltmesi (minor text correction) hizli yayin yolu.
--
-- Yonetisim karari (2026-10-28): basit yazim, imla, noktalama ve harf duzeltmeleri
-- icin 215'i genellestiren kontrollu ve guvenli yayin yolu.
--
-- Guvenlik ve Anlam Koruyuculari:
--   * JSON yapisi aynen korunur: ayni anahtarlar, ayni sik sayisi (options.length),
--     cevap anahtari (answer) ASLA degisemez.
--   * Sayilar / Rakamlar: Eski ve yeni metindeki tum sayisal diziler (0-9)
--     birebir ayni sira ve degerde korunmak zorundadir; sayi degistirilemez,
--     silinemez veya eklenemez.
--   * Harf Iskeleti: Bosluk ve . , ; : ! ? ' " ve tirnak isaretleri disindaki
--     her karakter ayni sirada kalir. Bir harf yalnizca buyuk/kucuk harf olarak
--     ya da ASCII'den Turkce karsiligina (c->ç, g->ğ, i->ı, o->ö, s->ş, u->ü,
--     a->â, i->î, u->û, I->İ) degisebilir. Boylece "artar"->"azalir",
--     "Ankara"->"Istanbul" veya ek eklenmesi (artar->artmaz) reddedilir.
--     Matematik isaretleri (- + = < > / ( ) %) iskelete dahildir, degisemez.
--   * Roma Rakamlari: Yalniz Roma rakami harflerinden olusan sozcuklerin
--     (I, II, IV...) dizisi birebir korunur.
--   * Olumsuzluk Kelimeleri: "degil", "yok", "hic", "asla", "olamaz", "yapamaz"
--     gibi anlami tersine ceviren sozcuklerin sayisi degisemez.
--   * Duzenleme Siniri: Her alanda karakter farki ve degisen sozcuk sayisi
--     katica sinirlidir (soru kokunde max 35 karakter / 8 sozcuk; siklarda
--     max 15 karakter / 3 sozcuk; cozumde max 60 karakter / 12 sozcuk).
--   * Kapsam Disi: Pasif sorular, wordquest, turkce/yazim_kurallari, kategori,
--     alt kategori veya konusu yazim/imla/noktalama/hece/ses bilgisi/anlatim
--     bozuklugu olan sorular, kokunde yazim/noktalama/imla gecen sorular ve
--     onayli TYT sosyal sorular.
--   * Kalite Karari: Taban revizyonun guncel politikadaki en yeni karari
--     APPROVED ise devralinir (215/218 gibi revizyon kimligine bagli; ozet
--     serilestirmesi karsilastirilmaz). Taban revizyonun HIC karari yoksa ve
--     revizyona bagli bir kalite politikasi yoksa "NONE_LEGACY" olarak tasinir
--     ve sahte onay damgalanmaz. REJECTED / NEEDS_REVIEW / INCONCLUSIVE karari,
--     eski politikada karari veya revizyona bagli politikasi (LGS/TYT @4-@5)
--     olan taban bu yoldan yayimlanamaz; iki asamali yola gider.
--   * Her yayin question_governance_events ve question_minor_text_corrections
--     tablosuna ayrintili diff ile kaydedilir.

BEGIN;

SET LOCAL lock_timeout = '10s';

CREATE TABLE IF NOT EXISTS public.question_minor_text_corrections (
  revision_id uuid PRIMARY KEY REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  base_revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  published_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  changes jsonb NOT NULL,
  base_policy_verdict text NOT NULL,
  rule_version text NOT NULL CHECK (rule_version = 'minor-text-correction@1'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.question_minor_text_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.question_minor_text_corrections FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.question_minor_text_correction_clean_digits(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
  -- Bas/son ayiraclar imzaya girmez: 'x = 3' ile 'x = 3.' ayni sayi dizisidir.
  -- Rakamlar arasindaki nokta ve virgul anlam tasir (1.000 bin, 1,000 bir).
  SELECT btrim(regexp_replace(regexp_replace(regexp_replace(
    translate(COALESCE(p_text, ''), '⁰¹²³⁴⁵⁶⁷⁸⁹', '0123456789'),
    '[^0-9.,]+', ' ', 'g'),
    '(?<![0-9])[.,]|[.,](?![0-9])', ' ', 'g'),
    ' +', ' ', 'g'), ' ');
$fn$;

CREATE OR REPLACE FUNCTION public.question_minor_text_correction_negation_count(p_text text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_count integer := 0;
BEGIN
  IF p_text IS NULL THEN RETURN 0; END IF;
  SELECT count(*)::int INTO v_count
  FROM regexp_matches(lower(translate(p_text, 'İIÇĞÖŞÜ', 'iıçğöşü')), '\m(degil|değil|degildir|değildir|yok|yoktur|hic|hiç|asla|olamaz|yapamaz|tuzsuz|etsiz|yagsiz|yağsız|kokusuz)\M', 'g');
  RETURN COALESCE(v_count, 0);
END
$fn$;

-- Locale-bagimsiz Turkce buyuk/kucuk harf katlamasi. lower() C/--no-locale
-- kumelerde ASCII disi harfleri kucultmez; bu yuzden acik eslem kullanilir.
CREATE OR REPLACE FUNCTION public.question_minor_text_correction_case_fold(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
  SELECT translate(COALESCE(p_text, ''),
    'ABCÇDEFGĞHIİJKLMNOÖPQRSŞTUÜVWXYZÂÎÛ',
    'abcçdefgğhıijklmnoöpqrsştuüvwxyzâîû');
$fn$;

-- Harf iskeleti: yalnizca bosluk ve metin noktalamasi atilir. Tire, parantez,
-- bolu ve matematik isaretleri bilerek iskelette kalir. Unlem ve kesme isareti
-- yalniz metindeki anlamlarinda atilir: en az iki harften sonra gelen ve
-- ardinda = olmayan unlem ("Dikkat!") ile harf ve kucuk harf arasindaki ek
-- kesmesi ("Ankara'nin"). 5!, n!, (n+1)!, !=, f'(x) ve A'B gibi matematik
-- kullanimlari iskelette kalir; kesme bicimleri once ASCII kesmeye esitlenir.
CREATE OR REPLACE FUNCTION public.question_minor_text_correction_skeleton(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
  SELECT regexp_replace(
    regexp_replace(
      regexp_replace(
        translate(COALESCE(p_text, ''), '’‘ʼ', ''''''''),
        '([A-Za-zÇĞİÖŞÜÂÎÛçğıöşüâîû])''(?=[a-zçğıöşüâîû])', '\1', 'g'),
      '([A-Za-zÇĞİÖŞÜÂÎÛçğıöşüâîû]{2})!(?!=)', '\1', 'g'),
    '[[:space:]\u00a0.,;:?…"“”«»]', '', 'g');
$fn$;

-- Buyuk/kucuk harf degisimine izin verilen konumlar: iskeletle hizali '0'/'1'
-- dizisi. '1' yalniz en az uc harfli bir harf dizisinin ilk harfidir. Co -> CO,
-- NaCl -> NACL, dna -> DNA gibi bilimsel simge ve kisaltma degisimleri boylece
-- reddedilir; "ankara" -> "Ankara" gibi bas harf duzeltmesi gecer. Iskeletle
-- ayni on islemler (kesme/unlem) ve ayni atilan karakter kumesi kullanilir.
CREATE OR REPLACE FUNCTION public.question_minor_text_correction_case_mask(p_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
DECLARE
  v text := regexp_replace(
    regexp_replace(
      translate(COALESCE(p_text, ''), '’‘ʼ', ''''''''),
      '([A-Za-zÇĞİÖŞÜÂÎÛçğıöşüâîû])''(?=[a-zçğıöşüâîû])', '\1', 'g'),
    '([A-Za-zÇĞİÖŞÜÂÎÛçğıöşüâîû]{2})!(?!=)', '\1', 'g');
  v_mask text := '';
  v_len integer := 0;
  v_run integer := 0;
  v_start integer := 0;
  c text;
BEGIN
  FOR i IN 1 .. char_length(v) LOOP
    c := substr(v, i, 1);
    IF c ~ '[[:space:]\u00a0.,;:?…"“”«»]' THEN
      IF v_run >= 3 THEN v_mask := overlay(v_mask PLACING '1' FROM v_start FOR 1); END IF;
      v_run := 0;
      CONTINUE;
    END IF;
    v_len := v_len + 1;
    v_mask := v_mask || '0';
    IF position(c IN 'ABCÇDEFGĞHIİJKLMNOÖPQRSŞTUÜVWXYZÂÎÛabcçdefgğhıijklmnoöpqrsştuüvwxyzâîû') > 0 THEN
      IF v_run = 0 THEN v_start := v_len; END IF;
      v_run := v_run + 1;
    ELSE
      IF v_run >= 3 THEN v_mask := overlay(v_mask PLACING '1' FROM v_start FOR 1); END IF;
      v_run := 0;
    END IF;
  END LOOP;
  IF v_run >= 3 THEN v_mask := overlay(v_mask PLACING '1' FROM v_start FOR 1); END IF;
  RETURN v_mask;
END
$fn$;

CREATE OR REPLACE FUNCTION public.question_minor_text_correction_letters_compatible(p_old text, p_new text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_old text := public.question_minor_text_correction_skeleton(p_old);
  v_new text := public.question_minor_text_correction_skeleton(p_new);
  v_mask_old text := public.question_minor_text_correction_case_mask(p_old);
  v_mask_new text := public.question_minor_text_correction_case_mask(p_new);
  a text;
  b text;
  fa text;
  fb text;
BEGIN
  IF char_length(v_old) <> char_length(v_new) THEN
    RETURN false;
  END IF;
  -- Maske iskeletle hizali olmali; degilse fail-closed.
  IF char_length(v_mask_old) <> char_length(v_old) OR char_length(v_mask_new) <> char_length(v_new) THEN
    RETURN false;
  END IF;
  FOR i IN 1 .. char_length(v_old) LOOP
    a := substr(v_old, i, 1);
    b := substr(v_new, i, 1);
    CONTINUE WHEN a = b;
    fa := public.question_minor_text_correction_case_fold(a);
    fb := public.question_minor_text_correction_case_fold(b);
    -- Buyuk/kucuk harf degisimi (I -> i/ı ve geri yuklemeyle birlikte olani dahil)
    -- yalniz yeni metinde en az uc harfli dizinin ilk harfinde: Co -> CO, NaCl ->
    -- NACL reddedilir; "Ortaçağ" -> "Orta Çağ" ayirma duzeltmesi gecer.
    IF (a <> fa) <> (b <> fb) AND substr(v_mask_new, i, 1) <> '1' THEN
      RETURN false;
    END IF;
    -- Ayni harfin buyuk/kucuk bicimi. case_fold harf disini degistirmedigi
    -- icin a <> b iken fa = fb ancak bir harfin iki bicimiyle olusur.
    CONTINUE WHEN fa = fb;
    -- ASCII buyuk I, Turkce metinde İ/i yerine yazilmis olabilir.
    CONTINUE WHEN a = 'I' AND fb = 'i';
    -- Noktali İ'nin noktasiz bicime inmesi geri yukleme degil, bozulmadir.
    IF a = 'İ' THEN RETURN false; END IF;
    -- Yalnizca ASCII -> Turkce harf geri yuklemesi; ters yon reddedilir.
    CONTINUE WHEN (fa, fb) IN (('c','ç'),('g','ğ'),('i','ı'),('o','ö'),('s','ş'),('u','ü'),('a','â'),('i','î'),('u','û'));
    RETURN false;
  END LOOP;
  RETURN true;
END
$fn$;

-- Harf geri yuklemesi (buyuk/kucuk disinda harf degisimi) yalniz 215'in govde
-- listesindeki sozcuklerde: alanda geri yukleme varsa harf dizileri bire bir
-- eslesmeli ve degisen her sozcuk listelenmis bir govdeyle baslamali. Liste
-- sapkali harf ve anlam ayiran ciftleri icermez: Hala -> Hâlâ (sozcuk anlami
-- sorusunda cevabi degistirir), kok -> kök, acisi -> açısı reddedilir. 230 bu
-- yolla 215'in sahip kararini (listesiz harf geri yuklemesi incelemesiz
-- yayimlanmaz) genisletmez.
CREATE OR REPLACE FUNCTION public.question_minor_text_correction_restoration_ok(p_old text, p_new text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_old text[];
  v_new text[];
BEGIN
  IF public.question_minor_text_correction_case_fold(public.question_minor_text_correction_skeleton(p_old))
     = public.question_minor_text_correction_case_fold(public.question_minor_text_correction_skeleton(p_new)) THEN
    RETURN true;
  END IF;
  SELECT COALESCE(array_agg(t ORDER BY ord), '{}'::text[]) INTO v_old
  FROM regexp_split_to_table(
    regexp_replace(translate(COALESCE(p_old, ''), '’‘ʼ', ''''''''), '([A-Za-zÇĞİÖŞÜÂÎÛçğıöşüâîû])''(?=[a-zçğıöşüâîû])', '\1', 'g'),
    '[^A-Za-zÇĞİÖŞÜÂÎÛçğıöşüâîû]+') WITH ORDINALITY AS x(t, ord)
  WHERE t <> '';
  SELECT COALESCE(array_agg(t ORDER BY ord), '{}'::text[]) INTO v_new
  FROM regexp_split_to_table(
    regexp_replace(translate(COALESCE(p_new, ''), '’‘ʼ', ''''''''), '([A-Za-zÇĞİÖŞÜÂÎÛçğıöşüâîû])''(?=[a-zçğıöşüâîû])', '\1', 'g'),
    '[^A-Za-zÇĞİÖŞÜÂÎÛçğıöşüâîû]+') WITH ORDINALITY AS x(t, ord)
  WHERE t <> '';
  IF cardinality(v_old) <> cardinality(v_new) THEN
    RETURN false;
  END IF;
  FOR i IN 1 .. cardinality(v_old) LOOP
    CONTINUE WHEN public.question_minor_text_correction_case_fold(v_old[i])
      = public.question_minor_text_correction_case_fold(v_new[i]);
    IF NOT EXISTS (
      SELECT 1 FROM public.question_turkish_restoration_stems stem
      WHERE starts_with(public.question_turkish_restoration_fold(v_old[i]), stem.ascii_stem)
        AND starts_with(lower(translate(v_new[i], 'İIÇĞÖŞÜ', 'iıçğöşü')), stem.turkish_stem)
    ) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END
$fn$;

CREATE OR REPLACE FUNCTION public.question_minor_text_correction_roman_tokens(p_text text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
  SELECT COALESCE(array_agg(t ORDER BY ord), '{}'::text[])
  FROM regexp_split_to_table(COALESCE(p_text, ''), '[^A-Za-z0-9ÇĞİÖŞÜÂÎÛçğıöşüâîû]+') WITH ORDINALITY AS x(t, ord)
  WHERE t ~ '^[IVXLCDM]+$';
$fn$;

CREATE OR REPLACE FUNCTION public.question_minor_text_correction_verify_string(
  p_field text,
  p_old text,
  p_new text,
  p_max_char_delta integer,
  p_max_word_diff integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_old_words text[];
  v_new_words text[];
  v_diff_count integer := 0;
  v_changes jsonb := '[]'::jsonb;
  v_len_old integer;
  v_len_new integer;
  v_min_words integer;
BEGIN
  IF p_old IS NULL AND p_new IS NULL THEN
    RETURN jsonb_build_object('field', p_field, 'changed', false);
  END IF;
  IF p_old IS NULL OR p_new IS NULL THEN
    RETURN NULL;
  END IF;
  IF NOT (p_new IS NFC NORMALIZED) THEN
    RETURN NULL;
  END IF;
  IF p_old = p_new THEN
    RETURN jsonb_build_object('field', p_field, 'changed', false);
  END IF;

  v_len_old := char_length(p_old);
  v_len_new := char_length(p_new);
  IF abs(v_len_new - v_len_old) > p_max_char_delta THEN
    RETURN NULL;
  END IF;

  IF public.question_minor_text_correction_clean_digits(p_old) IS DISTINCT FROM
     public.question_minor_text_correction_clean_digits(p_new) THEN
    RETURN NULL;
  END IF;

  IF public.question_minor_text_correction_negation_count(p_old) <>
     public.question_minor_text_correction_negation_count(p_new) THEN
    RETURN NULL;
  END IF;

  IF NOT public.question_minor_text_correction_letters_compatible(p_old, p_new) THEN
    RETURN NULL;
  END IF;

  IF public.question_minor_text_correction_roman_tokens(p_old) IS DISTINCT FROM
     public.question_minor_text_correction_roman_tokens(p_new) THEN
    RETURN NULL;
  END IF;

  IF NOT public.question_minor_text_correction_restoration_ok(p_old, p_new) THEN
    RETURN NULL;
  END IF;

  v_old_words := regexp_split_to_array(btrim(p_old), '\s+');
  v_new_words := regexp_split_to_array(btrim(p_new), '\s+');

  IF abs(cardinality(v_new_words) - cardinality(v_old_words)) > 3 THEN
    RETURN NULL;
  END IF;

  v_min_words := least(cardinality(v_old_words), cardinality(v_new_words));
  FOR i IN 1..v_min_words LOOP
    IF v_old_words[i] <> v_new_words[i] THEN
      v_diff_count := v_diff_count + 1;
      v_changes := v_changes || jsonb_build_object('old', v_old_words[i], 'new', v_new_words[i]);
    END IF;
  END LOOP;
  v_diff_count := v_diff_count + abs(cardinality(v_new_words) - cardinality(v_old_words));

  IF v_diff_count > p_max_word_diff THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'field', p_field,
    'changed', true,
    'diff_count', v_diff_count,
    'changes', v_changes
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.question_minor_text_correction_verify(p_old jsonb, p_new jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_keys_old text[];
  v_keys_new text[];
  v_k text;
  v_res jsonb;
  v_field_res jsonb := '[]'::jsonb;
  v_has_change boolean := false;
  v_opt_len integer;
  v_opt_res jsonb;
BEGIN
  IF p_old IS NULL OR p_new IS NULL OR p_old = p_new THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p_old) <> 'object' OR jsonb_typeof(p_new) <> 'object' THEN
    RETURN NULL;
  END IF;

  SELECT array_agg(k ORDER BY k) INTO v_keys_old FROM jsonb_object_keys(p_old) k;
  SELECT array_agg(k ORDER BY k) INTO v_keys_new FROM jsonb_object_keys(p_new) k;
  IF v_keys_old IS DISTINCT FROM v_keys_new THEN
    RETURN NULL;
  END IF;

  -- JSON degeri birebir: 0 ile "0" farklidir (puanlama sayisal answer bekler).
  IF p_old->'answer' IS DISTINCT FROM p_new->'answer' THEN
    RETURN NULL;
  END IF;
  IF p_old ? 'correct' AND p_old->'correct' IS DISTINCT FROM p_new->'correct' THEN
    RETURN NULL;
  END IF;
  IF jsonb_typeof(p_old->'question') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_new->'question') IS DISTINCT FROM 'string' THEN
    RETURN NULL;
  END IF;

  IF jsonb_typeof(p_old->'options') <> 'array' OR jsonb_typeof(p_new->'options') <> 'array' THEN
    RETURN NULL;
  END IF;
  v_opt_len := jsonb_array_length(p_old->'options');
  IF jsonb_array_length(p_new->'options') <> v_opt_len THEN
    RETURN NULL;
  END IF;

  FOR i IN 0 .. v_opt_len - 1 LOOP
    -- ->> sayiyi metne cevirir; tip degisimi ya da metin disi sik reddedilir.
    IF COALESCE(jsonb_typeof(p_old->'options'->i), 'null') NOT IN ('string', 'null')
       OR COALESCE(jsonb_typeof(p_new->'options'->i), 'null') NOT IN ('string', 'null') THEN
      RETURN NULL;
    END IF;
    v_opt_res := public.question_minor_text_correction_verify_string(
      'options[' || i || ']',
      p_old->'options'->>i,
      p_new->'options'->>i,
      15,
      3
    );
    IF v_opt_res IS NULL THEN
      RETURN NULL;
    END IF;
    IF (v_opt_res->>'changed')::boolean THEN
      v_has_change := true;
      v_field_res := v_field_res || v_opt_res;
    END IF;
  END LOOP;

  v_res := public.question_minor_text_correction_verify_string(
    'question',
    p_old->>'question',
    p_new->>'question',
    35,
    8
  );
  IF v_res IS NULL THEN RETURN NULL; END IF;
  IF (v_res->>'changed')::boolean THEN
    v_has_change := true;
    v_field_res := v_field_res || v_res;
  END IF;

  IF p_old ? 'solution' THEN
    IF COALESCE(jsonb_typeof(p_old->'solution'), 'null') NOT IN ('string', 'null')
       OR COALESCE(jsonb_typeof(p_new->'solution'), 'null') NOT IN ('string', 'null') THEN
      RETURN NULL;
    END IF;
    v_res := public.question_minor_text_correction_verify_string(
      'solution',
      p_old->>'solution',
      p_new->>'solution',
      60,
      12
    );
    IF v_res IS NULL THEN RETURN NULL; END IF;
    IF (v_res->>'changed')::boolean THEN
      v_has_change := true;
      v_field_res := v_field_res || v_res;
    END IF;
  END IF;

  IF p_old ? 'passage' THEN
    IF COALESCE(jsonb_typeof(p_old->'passage'), 'null') NOT IN ('string', 'null')
       OR COALESCE(jsonb_typeof(p_new->'passage'), 'null') NOT IN ('string', 'null') THEN
      RETURN NULL;
    END IF;
    v_res := public.question_minor_text_correction_verify_string(
      'passage',
      p_old->>'passage',
      p_new->>'passage',
      40,
      8
    );
    IF v_res IS NULL THEN RETURN NULL; END IF;
    IF (v_res->>'changed')::boolean THEN
      v_has_change := true;
      v_field_res := v_field_res || v_res;
    END IF;
  END IF;

  FOREACH v_k IN ARRAY v_keys_old LOOP
    IF v_k NOT IN ('answer', 'correct', 'options', 'question', 'solution', 'passage') THEN
      IF (p_old->v_k) IS DISTINCT FROM (p_new->v_k) THEN
        RETURN NULL;
      END IF;
    END IF;
  END LOOP;

  IF NOT v_has_change THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'changed_fields', v_field_res
  );
END
$fn$;

CREATE OR REPLACE FUNCTION public.publish_question_minor_text_correction(
  p_user_id uuid,
  p_question_id uuid,
  p_base_revision_id uuid,
  p_content jsonb,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  q public.questions%ROWTYPE;
  base public.question_content_revisions%ROWTYPE;
  r public.question_content_revisions%ROWTYPE;
  d public.question_validation_decisions%ROWTYPE;
  old public.content_governance_requests%ROWTYPE;
  v_policy text;
  v_has_approved boolean;
  v_changes jsonb;
  v_base_verdict text;
  h text;
  n integer;
  out jsonb;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id, 'content.prepare')
    OR NOT public.content_governance_has_permission(p_user_id, 'content.publish') THEN
    RAISE EXCEPTION 'content prepare and publish permissions required' USING ERRCODE='42501';
  END IF;
  IF p_question_id IS NULL OR p_base_revision_id IS NULL OR p_request_id IS NULL
    OR jsonb_typeof(p_content) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid minor text correction request' USING ERRCODE='22023';
  END IF;
  PERFORM public.content_governance_lock_request(p_user_id, 'minor_text_correction', p_request_id);
  h := public.content_governance_hash(jsonb_build_object(
    'questionId', p_question_id, 'baseRevisionId', p_base_revision_id, 'content', p_content
  ));
  SELECT * INTO old FROM public.content_governance_requests
  WHERE user_id = p_user_id AND operation = 'minor_text_correction' AND request_id = p_request_id;
  IF FOUND THEN
    IF old.payload_hash <> h THEN
      RAISE EXCEPTION 'minor text correction request payload mismatch' USING ERRCODE='22023';
    END IF;
    RETURN old.result || jsonb_build_object('replayed', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('content-revision:' || p_question_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('content-publish:' || p_question_id::text, 0));

  SELECT * INTO q FROM public.questions WHERE id = p_question_id FOR UPDATE;
  IF NOT FOUND OR q.published_revision_id IS DISTINCT FROM p_base_revision_id THEN
    RAISE EXCEPTION 'stale or unknown revision base' USING ERRCODE='22023';
  END IF;
  IF NOT q.is_active THEN
    RAISE EXCEPTION 'inactive question: use the two-stage revision path' USING ERRCODE='22023';
  END IF;

  SELECT * INTO base FROM public.question_content_revisions
  WHERE id = p_base_revision_id AND question_id = p_question_id AND status = 'published';
  IF NOT FOUND OR base.content IS DISTINCT FROM q.content THEN
    RAISE EXCEPTION 'published revision does not match live content' USING ERRCODE='22023';
  END IF;

  IF base.game = 'wordquest'
    OR (base.game = 'turkce' AND base.category = 'yazim_kurallari')
    OR public.question_turkish_restoration_fold(
         COALESCE(base.category, '') || ' ' || COALESCE(base.subcategory, '') || ' ' || COALESCE(base.topic, ''))
       ~ '(yazim|imla|noktalama|hece|ses_bilgisi|ses bilgisi|ses_olaylari|ses olaylari|anlatim_bozuklugu|anlatim bozuklugu)'
    OR public.question_turkish_restoration_fold(COALESCE(base.content->>'question', ''))
       ~ '(yazim|yazil|imla|noktalama|buyuk harf|kucuk harf|kesme isaret|ses olay|unlu dus|unlu uyum|unsuz)' THEN
    RAISE EXCEPTION 'spelling-topic question: use the two-stage revision path' USING ERRCODE='22023';
  END IF;

  IF base.game = 'sosyal' AND upper(btrim(COALESCE(base.exam_ref, ''))) = 'TYT'
    AND EXISTS (
      SELECT 1 FROM public.question_revision_approvals a
      WHERE a.revision_id = base.id AND a.decision = 'approved'
    ) THEN
    RAISE EXCEPTION 'approved TYT social revision: use the reviewed revision path' USING ERRCODE='22023';
  END IF;

  v_changes := public.question_minor_text_correction_verify(base.content, p_content);
  IF v_changes IS NULL THEN
    RAISE EXCEPTION 'not a verified minor text correction: use the two-stage revision path'
      USING ERRCODE='22023';
  END IF;

  SELECT required_policy_version INTO v_policy
  FROM public.question_validation_runtime WHERE singleton;
  IF v_policy IS NULL THEN
    RAISE EXCEPTION 'question validation runtime policy missing' USING ERRCODE='22023';
  END IF;

  -- Revizyona bagli kalite politikasi (fen/turkce LGS, 229 TYT) yeni revizyona
  -- tasinamaz: baglama kendi kosu kanitini ister. Bu tabanlar inceleme yoluna gider.
  IF EXISTS (
    SELECT 1 FROM public.question_validation_revision_policies b WHERE b.revision_id = base.id
  ) OR public.question_revision_validation_policy(base.id) IS DISTINCT FROM v_policy THEN
    RAISE EXCEPTION 'revision-bound quality policy: use the reviewed revision path' USING ERRCODE='22023';
  END IF;

  -- Karar revizyon kimligine baglanir (215/218 ile ayni); revizyon icerigi
  -- degismez. content_sha256 karsilastirilmaz: 2026-08-22 denetim kosusu ozeti
  -- bosluksuz JSON uzerinden, revizyon ozeti jsonb::text uzerinden hesaplanmistir
  -- (ayni icerik, farkli serilestirme). Guncel politikadaki EN YENI karar
  -- APPROVED olmalidir; sonradan gelen NEEDS_REVIEW eski onayi gecersiz kilar.
  SELECT * INTO d FROM public.question_validation_decisions
  WHERE revision_id = base.id AND policy_version = v_policy
  ORDER BY decided_at DESC, created_at DESC
  LIMIT 1;
  v_has_approved := FOUND AND d.verdict = 'APPROVED';

  IF v_has_approved THEN
    v_base_verdict := 'APPROVED@' || v_policy;
  ELSIF EXISTS (
    SELECT 1 FROM public.question_validation_decisions x WHERE x.revision_id = base.id
  ) THEN
    -- REJECTED / NEEDS_REVIEW / INCONCLUSIVE ya da eski politika karari: legacy degildir.
    RAISE EXCEPTION 'base revision has a non-current or non-approved quality decision: use the two-stage revision path'
      USING ERRCODE='22023';
  ELSE
    v_base_verdict := 'NONE_LEGACY';
  END IF;

  SELECT COALESCE(max(revision_no), 0) + 1 INTO n
  FROM public.question_content_revisions WHERE question_id = p_question_id;

  INSERT INTO public.question_content_revisions(
    question_id, revision_no, base_revision_id, game, category, subcategory, topic,
    difficulty, level_tag, exam_ref, is_boss, content, content_sha256, change_kind,
    change_summary, prepared_by, outcomes_prepared_by
  ) VALUES (
    p_question_id, n, base.id, base.game, base.category, base.subcategory, base.topic,
    base.difficulty, base.level_tag, base.exam_ref, base.is_boss, p_content,
    encode(extensions.digest(p_content::text, 'sha256'), 'hex'), 'edit',
    left('Kucuk metin duzeltmesi (230, hizli yol): ' || (v_changes->>'changed_fields'), 500),
    p_user_id, base.outcomes_prepared_by
  ) RETURNING * INTO r;

  INSERT INTO public.question_revision_sources(
    revision_id, source_kind, source_title, source_url, license_code, license_url,
    attribution, provenance_ref
  )
  SELECT r.id, source_kind, source_title, source_url, license_code, license_url,
    attribution, provenance_ref
  FROM public.question_revision_sources WHERE revision_id = base.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'base revision source record missing' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.question_revision_outcomes(revision_id, outcome_id, weight, is_primary)
  SELECT r.id, outcome_id, weight, is_primary
  FROM public.question_revision_outcomes WHERE revision_id = base.id;

  IF v_has_approved THEN
    INSERT INTO public.question_validation_decisions(
      question_id, revision_id, content_sha256, policy_version, verdict, findings,
      rationale, blind_consensus_index, blind_agreement_ratio, run_id, decided_at
    ) VALUES (
      p_question_id, r.id, r.content_sha256, v_policy, 'APPROVED', d.findings,
      'Carried over from revision ' || base.id::text
        || ' by migration 230 (minor text correction; strict structural and diacritic/typo guards verified). '
        || d.rationale,
      d.blind_consensus_index, d.blind_agreement_ratio, d.run_id, clock_timestamp()
    );
  END IF;

  INSERT INTO public.question_minor_text_corrections(
    revision_id, question_id, base_revision_id, published_by, changes, base_policy_verdict, rule_version
  ) VALUES (
    r.id, p_question_id, base.id, p_user_id, v_changes, v_base_verdict, 'minor-text-correction@1'
  );

  PERFORM public.content_governance_authorize_question_write(p_question_id, 'publish');
  UPDATE public.questions SET content = r.content, published_revision_id = r.id
  WHERE id = p_question_id;
  PERFORM public.content_governance_clear_question_write(p_question_id);

  UPDATE public.question_content_revisions SET status = 'superseded'
  WHERE question_id = p_question_id AND status = 'published' AND id <> r.id;
  UPDATE public.question_content_revisions
  SET status = 'published', published_at = clock_timestamp() WHERE id = r.id;

  INSERT INTO public.question_governance_events(
    question_id, revision_id, actor_id, event_type, public_reason
  ) VALUES (
    p_question_id, r.id, p_user_id, 'published',
    'Minor text correction published without review (migration 230)'
  );

  out := jsonb_build_object(
    'questionId', p_question_id,
    'revisionId', r.id,
    'status', 'published',
    'changes', v_changes,
    'basePolicyVerdict', v_base_verdict,
    'replayed', false
  );
  INSERT INTO public.content_governance_requests
  VALUES(p_user_id, 'minor_text_correction', p_request_id, h, out, clock_timestamp());
  RETURN out;
END
$fn$;

CREATE OR REPLACE FUNCTION public.tg_require_question_validation_decision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_revision public.question_content_revisions%ROWTYPE;
  v_policy text;
  v_enforce boolean;
  v_verdict text;
BEGIN
  IF NEW.published_revision_id IS NOT DISTINCT FROM OLD.published_revision_id
     OR NEW.published_revision_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT enforce_publish_gate, required_policy_version
    INTO v_enforce, v_policy
  FROM public.question_validation_runtime WHERE singleton;
  IF NOT COALESCE(v_enforce, false) THEN RETURN NEW; END IF;

  SELECT * INTO v_revision
  FROM public.question_content_revisions
  WHERE id = NEW.published_revision_id AND question_id = NEW.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'published revision does not belong to question' USING ERRCODE='22023';
  END IF;
  IF v_revision.change_kind = 'retire' THEN RETURN NEW; END IF;

  -- Migration 230: Kucuk metin duzeltmesi kaydi varsa ve taban HIC karari ve
  -- revizyona bagli politikasi olmayan legacy revizyonsa, legacy durumunun
  -- devrine izin verilir. Tabanda herhangi bir karar varsa normal kapi uygulanir.
  IF EXISTS (
    SELECT 1 FROM public.question_minor_text_corrections m
    WHERE m.revision_id = v_revision.id AND m.base_policy_verdict = 'NONE_LEGACY'
      AND m.base_revision_id = v_revision.base_revision_id
      AND NOT EXISTS (SELECT 1 FROM public.question_validation_decisions x WHERE x.revision_id = m.base_revision_id)
      AND NOT EXISTS (SELECT 1 FROM public.question_validation_decisions x WHERE x.revision_id = v_revision.id)
      AND NOT EXISTS (SELECT 1 FROM public.question_validation_revision_policies b
                      WHERE b.revision_id IN (m.base_revision_id, v_revision.id))
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM public.lock_question_revision_validation_run(v_revision.id);
  v_policy := public.question_revision_validation_policy(v_revision.id);

  SELECT verdict INTO v_verdict
  FROM public.question_validation_decisions
  WHERE revision_id = v_revision.id
    AND content_sha256 = v_revision.content_sha256
    AND policy_version = v_policy;

  IF v_verdict IS NULL OR v_verdict NOT IN ('APPROVED','NEEDS_REVIEW') THEN
    RAISE EXCEPTION 'current automated validation decision required before publish'
      USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION public.question_minor_text_correction_clean_digits(text),
  public.question_minor_text_correction_negation_count(text),
  public.question_minor_text_correction_case_fold(text),
  public.question_minor_text_correction_skeleton(text),
  public.question_minor_text_correction_case_mask(text),
  public.question_minor_text_correction_letters_compatible(text, text),
  public.question_minor_text_correction_roman_tokens(text),
  public.question_minor_text_correction_restoration_ok(text, text),
  public.question_minor_text_correction_verify_string(text, text, text, integer, integer),
  public.question_minor_text_correction_verify(jsonb, jsonb),
  public.publish_question_minor_text_correction(uuid, uuid, uuid, jsonb, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.publish_question_minor_text_correction(uuid, uuid, uuid, jsonb, uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
