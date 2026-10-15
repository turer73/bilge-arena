-- Migration 215: Turkce harf duzeltmesi icin iki insan onaysiz yayin yolu.
--
-- Owner karari (2026-09-30): basit Turkce karakter kaybi ("asagidaki",
-- "dogru", "sinif") iki insan onayi beklemez. LLM burada otorite degildir:
-- veritabani degisikligin YALNIZ listelenmis bir govdenin ASCII harflerini
-- Turkce karsiliklarina cevirdigini harf harf kanitlar. Kanitlanamayan her
-- degisiklik 106/164 iki onayli yoldan gider.
--
-- Kanit (question_turkish_restoration_words):
--   * JSON yapisi aynen korunur: ayni anahtarlar, ayni dizi uzunluklari,
--     string disi her deger (answer, sayilar) esit. Cevap ve sik sirasi
--     degisemez.
--   * Yeni metin NFC; her string ayni uzunlukta ve farkli her karakter
--     c->ç g->ğ i->ı o->ö s->ş u->ü (buyukleri ve I->İ) ciftlerinden biri.
--   * Degisen her sozcugun ASCII'ye katlanmis eski hali listelenmis bir
--     govdeyle, yeni hali o govdenin Turkce yazimiyla baslar. "ol"->"öl" gibi
--     anlam degistiren ceviriler listede olmadigi icin reddedilir. Liste
--     scan-question-text-defects.mjs TURKISH_RESTORATION_STEMS ile birebir
--     aynidir (test denetler).
-- Kapsam disi: pasif sorular, wordquest (Ingilizce), turkce/yazim_kurallari
-- ve kokunde yazim/noktalama/buyuk harf/kesme isareti/ses olayi gecen sorular
-- (oradaki hatali yazimlar bilincli celdiricidir).
--
-- Yayin kapisi (136): yeni revizyon, taban revizyonun gecerli politikadaki
-- APPROVED kararini devralir; karar gerekcesi devri acikca yazar. Taban
-- revizyonun karari APPROVED degilse ya da gecerli politikada baska bir
-- verdict'i varsa yol kapanir.
-- Kaynak kaydi ve kazanim eslemesi taban revizyondan aynen tasinir;
-- question_outcomes'a dokunulmaz (harf duzeltmesi eslemeyi degistirmez).
-- Her yayin question_governance_events ve question_turkish_restorations'a
-- yazilir.

BEGIN;

SET LOCAL lock_timeout = '10s';

CREATE TABLE IF NOT EXISTS public.question_turkish_restoration_stems (
  ascii_stem text PRIMARY KEY CHECK (ascii_stem ~ '^[a-z]{2,40}$'),
  turkish_stem text NOT NULL CHECK (
    turkish_stem ~ '^[a-zçğıöşü]{2,40}$'
    AND char_length(turkish_stem) = char_length(ascii_stem)
    AND turkish_stem <> ascii_stem
  )
);
ALTER TABLE public.question_turkish_restoration_stems ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.question_turkish_restoration_stems FROM PUBLIC, anon, authenticated, service_role;

DELETE FROM public.question_turkish_restoration_stems;
INSERT INTO public.question_turkish_restoration_stems(ascii_stem, turkish_stem) VALUES
  ('asagidaki','aşağıdaki'),('asagida','aşağıda'),('yukaridaki','yukarıdaki'),('dogru','doğru'),
  ('yanlis','yanlış'),('degil','değil'),('degildir','değildir'),('gelisim','gelişim'),
  ('gelismis','gelişmiş'),('gelismislik','gelişmişlik'),('yukseklik','yükseklik'),('yuksek','yüksek'),
  ('uzunlugu','uzunluğu'),('olculmez','ölçülmez'),('olcut','ölçüt'),('olcum','ölçüm'),
  ('gunluk','günlük'),('gunumuz','günümüz'),('bugun','bugün'),('yararlandigi','yararlandığı'),
  ('kolaylik','kolaylık'),('kolaylikla','kolaylıkla'),('kulturel','kültürel'),('kultur','kültür'),
  ('niteligi','niteliği'),('niteliginden','niteliğinden'),('dusmek','düşmek'),('dustugu','düştüğü'),
  ('dusunce','düşünce'),('dusun','düşün'),('buyuk','büyük'),('kucuk','küçük'),
  ('ucgen','üçgen'),('ucte','üçte'),('dunya','dünya'),('dunyanin','dünyanın'),
  ('yuzey','yüzey'),('yuzeyinin','yüzeyinin'),('sirada','sırada'),('sinif','sınıf'),
  ('sinav','sınav'),('ogrenci','öğrenci'),('ogretmen','öğretmen'),('ogren','öğren'),
  ('cozum','çözüm'),('cozumu','çözümü'),('secenek','seçenek'),('yaklasik','yaklaşık'),
  ('iliski','ilişki'),('gorulur','görülür'),('gorulen','görülen'),('gore','göre'),
  ('ozellik','özellik'),('ozgun','özgün'),('uretim','üretim'),('ulke','ülke'),
  ('sehir','şehir'),('odakli','odaklı'),('altyapi','altyapı'),('once','önce'),
  ('icin','için'),('catisma','çatışma'),('degisim','değişim'),('degisken','değişken'),
  ('isik','ışık'),('sicaklik','sıcaklık'),('basinc','basınç'),('carpim','çarpım'),
  ('bolum','bölüm'),('toplami','toplamı'),('kacinci','kaçıncı'),('esittir','eşittir'),
  ('esit','eşit');

CREATE TABLE IF NOT EXISTS public.question_turkish_restorations (
  revision_id uuid PRIMARY KEY REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,
  base_revision_id uuid NOT NULL REFERENCES public.question_content_revisions(id) ON DELETE RESTRICT,
  published_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  words text[] NOT NULL CHECK (cardinality(words) BETWEEN 1 AND 1000),
  rule_version text NOT NULL CHECK (rule_version = 'turkish-letter-restoration@1'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.question_turkish_restorations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.question_turkish_restorations FROM PUBLIC, anon, authenticated, service_role;

-- Turkce harfleri ASCII tabanina katlar ve kucultur ("Aşağıdaki" -> "asagidaki").
CREATE OR REPLACE FUNCTION public.question_turkish_restoration_fold(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $fn$
  SELECT translate(lower(translate(p_text,'İIÇĞÖŞÜÂÎÛ','iıçğöşüâîû')),'çğıöşüâîû','cgiosuaiu')
$fn$;

-- Tek string: NULL = saf Turkce harf geri getirmesi degil; aksi halde degisen
-- sozcukler ('eski>yeni').
CREATE OR REPLACE FUNCTION public.question_turkish_restoration_string(p_old text, p_new text)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_old text;
  v_len integer;
  v_a text;
  v_b text;
  v_start integer;
  v_end integer;
  v_old_word text;
  v_new_word text;
  v_seen integer[] := '{}';
  v_words text[] := '{}';
  c_letter constant text := '^[A-Za-zÀ-ÖØ-öø-ɏ]$';
BEGIN
  IF p_old IS NULL OR p_new IS NULL OR NOT (p_new IS NFC NORMALIZED) THEN
    RETURN NULL;
  END IF;
  v_old := normalize(p_old, NFC);
  IF v_old = p_new THEN
    RETURN v_words;
  END IF;
  v_len := char_length(v_old);
  IF char_length(p_new) <> v_len THEN
    RETURN NULL;
  END IF;
  FOR i IN 1..v_len LOOP
    v_a := substr(v_old, i, 1);
    v_b := substr(p_new, i, 1);
    CONTINUE WHEN v_a = v_b;
    IF (v_a, v_b) NOT IN (
      ('c','ç'),('g','ğ'),('i','ı'),('o','ö'),('s','ş'),('u','ü'),
      ('C','Ç'),('G','Ğ'),('I','İ'),('O','Ö'),('S','Ş'),('U','Ü')
    ) THEN
      RETURN NULL;
    END IF;
    v_start := i;
    WHILE v_start > 1 AND substr(v_old, v_start - 1, 1) ~ c_letter LOOP
      v_start := v_start - 1;
    END LOOP;
    CONTINUE WHEN v_start = ANY(v_seen);
    v_seen := v_seen || v_start;
    v_end := i;
    WHILE v_end < v_len AND substr(v_old, v_end + 1, 1) ~ c_letter LOOP
      v_end := v_end + 1;
    END LOOP;
    v_old_word := substr(v_old, v_start, v_end - v_start + 1);
    v_new_word := substr(p_new, v_start, v_end - v_start + 1);
    IF NOT EXISTS (
      SELECT 1 FROM public.question_turkish_restoration_stems stem
      WHERE starts_with(public.question_turkish_restoration_fold(v_old_word), stem.ascii_stem)
        AND starts_with(lower(translate(v_new_word,'İIÇĞÖŞÜ','iıçğöşü')), stem.turkish_stem)
    ) THEN
      RETURN NULL;
    END IF;
    v_words := v_words || (v_old_word || '>' || v_new_word);
  END LOOP;
  RETURN v_words;
END
$fn$;

-- JSON: yapi aynen korunur; string disi degerler esit olmali.
CREATE OR REPLACE FUNCTION public.question_turkish_restoration_words(p_old jsonb, p_new jsonb)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_type text;
  v_key text;
  v_part text[];
  v_words text[] := '{}';
BEGIN
  IF p_old IS NULL OR p_new IS NULL THEN
    RETURN NULL;
  END IF;
  v_type := jsonb_typeof(p_old);
  IF v_type <> jsonb_typeof(p_new) THEN
    RETURN NULL;
  END IF;
  IF v_type = 'string' THEN
    RETURN public.question_turkish_restoration_string(p_old #>> '{}', p_new #>> '{}');
  END IF;
  IF v_type = 'object' THEN
    IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_old) k)
       IS DISTINCT FROM (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_new) k) THEN
      RETURN NULL;
    END IF;
    FOR v_key IN SELECT k FROM jsonb_object_keys(p_old) k ORDER BY k LOOP
      v_part := public.question_turkish_restoration_words(p_old -> v_key, p_new -> v_key);
      IF v_part IS NULL THEN
        RETURN NULL;
      END IF;
      v_words := v_words || v_part;
    END LOOP;
    RETURN v_words;
  END IF;
  IF v_type = 'array' THEN
    IF jsonb_array_length(p_old) <> jsonb_array_length(p_new) THEN
      RETURN NULL;
    END IF;
    FOR i IN 0 .. jsonb_array_length(p_old) - 1 LOOP
      v_part := public.question_turkish_restoration_words(p_old -> i, p_new -> i);
      IF v_part IS NULL THEN
        RETURN NULL;
      END IF;
      v_words := v_words || v_part;
    END LOOP;
    RETURN v_words;
  END IF;
  RETURN CASE WHEN p_old = p_new THEN v_words END;
END
$fn$;

CREATE OR REPLACE FUNCTION public.publish_question_turkish_restoration(
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
  v_found boolean;
  v_words text[];
  h text;
  n integer;
  out jsonb;
BEGIN
  IF NOT public.content_governance_has_permission(p_user_id,'content.prepare')
    OR NOT public.content_governance_has_permission(p_user_id,'content.publish') THEN
    RAISE EXCEPTION 'content prepare and publish permissions required' USING ERRCODE='42501';
  END IF;
  IF p_question_id IS NULL OR p_base_revision_id IS NULL OR p_request_id IS NULL
    OR jsonb_typeof(p_content) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'invalid Turkish restoration request' USING ERRCODE='22023';
  END IF;
  PERFORM public.content_governance_lock_request(p_user_id,'turkish_restoration',p_request_id);
  h:=public.content_governance_hash(jsonb_build_object(
    'questionId',p_question_id,'baseRevisionId',p_base_revision_id,'content',p_content
  ));
  SELECT * INTO old FROM public.content_governance_requests
  WHERE user_id=p_user_id AND operation='turkish_restoration' AND request_id=p_request_id;
  IF FOUND THEN
    IF old.payload_hash<>h THEN
      RAISE EXCEPTION 'Turkish restoration request payload mismatch' USING ERRCODE='22023';
    END IF;
    RETURN old.result||jsonb_build_object('replayed',true);
  END IF;
  -- Ayni kilit sirasi: create (content-revision) sonra publish (content-publish).
  PERFORM pg_advisory_xact_lock(hashtextextended('content-revision:'||p_question_id::text,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('content-publish:'||p_question_id::text,0));
  SELECT * INTO q FROM public.questions WHERE id=p_question_id FOR UPDATE;
  IF NOT FOUND OR q.published_revision_id IS DISTINCT FROM p_base_revision_id THEN
    RAISE EXCEPTION 'stale or unknown revision base' USING ERRCODE='22023';
  END IF;
  IF NOT q.is_active THEN
    RAISE EXCEPTION 'inactive question: use the two-stage revision path' USING ERRCODE='22023';
  END IF;
  SELECT * INTO base FROM public.question_content_revisions
  WHERE id=p_base_revision_id AND question_id=p_question_id AND status='published';
  IF NOT FOUND OR base.content IS DISTINCT FROM q.content THEN
    RAISE EXCEPTION 'published revision does not match live content' USING ERRCODE='22023';
  END IF;
  IF base.game='wordquest'
    OR (base.game='turkce' AND base.category='yazim_kurallari')
    OR public.question_turkish_restoration_fold(COALESCE(base.content->>'question',''))
       ~ '(yazim|yazil|imla|noktalama|buyuk harf|kucuk harf|kesme isaret|ses olay|unlu dus|unlu uyum|unsuz)' THEN
    RAISE EXCEPTION 'spelling-topic question: use the two-stage revision path' USING ERRCODE='22023';
  END IF;
  v_words:=public.question_turkish_restoration_words(base.content,p_content);
  IF v_words IS NULL OR cardinality(v_words)=0 THEN
    RAISE EXCEPTION 'not a pure Turkish letter restoration of listed stems: use the two-stage revision path'
      USING ERRCODE='22023';
  END IF;

  SELECT required_policy_version INTO v_policy
  FROM public.question_validation_runtime WHERE singleton;
  SELECT * INTO d FROM public.question_validation_decisions
  WHERE revision_id=base.id AND policy_version=v_policy AND verdict='APPROVED'
  ORDER BY decided_at DESC, created_at DESC
  LIMIT 1;
  v_found:=FOUND;
  IF v_policy IS NULL OR NOT v_found OR EXISTS (
    SELECT 1 FROM public.question_validation_decisions
    WHERE revision_id=base.id AND policy_version=v_policy AND verdict<>'APPROVED'
  ) THEN
    RAISE EXCEPTION 'base revision needs an APPROVED validation decision under the current policy'
      USING ERRCODE='22023';
  END IF;

  SELECT COALESCE(max(revision_no),0)+1 INTO n
  FROM public.question_content_revisions WHERE question_id=p_question_id;
  INSERT INTO public.question_content_revisions(
    question_id,revision_no,base_revision_id,game,category,subcategory,topic,
    difficulty,level_tag,exam_ref,is_boss,content,content_sha256,change_kind,
    change_summary,prepared_by,outcomes_prepared_by
  ) VALUES (
    p_question_id,n,base.id,base.game,base.category,base.subcategory,base.topic,
    base.difficulty,base.level_tag,base.exam_ref,base.is_boss,p_content,
    encode(extensions.digest(p_content::text,'sha256'),'hex'),'edit',
    left('Turkce harf duzeltmesi (215, iki onay gerekmez): '||array_to_string(v_words,', '),500),
    p_user_id,base.outcomes_prepared_by
  ) RETURNING * INTO r;
  INSERT INTO public.question_revision_sources(
    revision_id,source_kind,source_title,source_url,license_code,license_url,
    attribution,provenance_ref
  )
  SELECT r.id,source_kind,source_title,source_url,license_code,license_url,
    attribution,provenance_ref
  FROM public.question_revision_sources WHERE revision_id=base.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'base revision source record missing' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.question_revision_outcomes(revision_id,outcome_id,weight,is_primary)
  SELECT r.id,outcome_id,weight,is_primary
  FROM public.question_revision_outcomes WHERE revision_id=base.id;
  INSERT INTO public.question_validation_decisions(
    question_id,revision_id,content_sha256,policy_version,verdict,findings,
    rationale,blind_consensus_index,blind_agreement_ratio,run_id,decided_at
  ) VALUES (
    p_question_id,r.id,r.content_sha256,v_policy,'APPROVED',d.findings,
    'Carried over from revision '||base.id::text
      ||' by migration 215 (Turkish letter restoration; content differs only by listed ASCII->Turkish letters). '
      ||d.rationale,
    d.blind_consensus_index,d.blind_agreement_ratio,d.run_id,clock_timestamp()
  );

  PERFORM public.content_governance_authorize_question_write(p_question_id,'publish');
  UPDATE public.questions SET content=r.content,published_revision_id=r.id
  WHERE id=p_question_id;
  PERFORM public.content_governance_clear_question_write(p_question_id);
  UPDATE public.question_content_revisions SET status='superseded'
  WHERE question_id=p_question_id AND status='published' AND id<>r.id;
  UPDATE public.question_content_revisions
  SET status='published',published_at=clock_timestamp() WHERE id=r.id;
  INSERT INTO public.question_governance_events(
    question_id,revision_id,actor_id,event_type,public_reason
  ) VALUES (
    p_question_id,r.id,p_user_id,'published',
    'Turkish letter restoration published without review (migration 215)'
  );
  INSERT INTO public.question_turkish_restorations(
    revision_id,question_id,base_revision_id,published_by,words,rule_version
  ) VALUES (r.id,p_question_id,base.id,p_user_id,v_words,'turkish-letter-restoration@1');
  out:=jsonb_build_object(
    'questionId',p_question_id,'revisionId',r.id,'status','published',
    'words',to_jsonb(v_words),'replayed',false
  );
  INSERT INTO public.content_governance_requests
  VALUES(p_user_id,'turkish_restoration',p_request_id,h,out,clock_timestamp());
  RETURN out;
END
$fn$;

REVOKE ALL ON FUNCTION public.question_turkish_restoration_fold(text),
  public.question_turkish_restoration_string(text,text),
  public.question_turkish_restoration_words(jsonb,jsonb),
  public.publish_question_turkish_restoration(uuid,uuid,uuid,jsonb,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.publish_question_turkish_restoration(uuid,uuid,uuid,jsonb,uuid)
  TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
