-- Migration 109: kanonik-dışı kategorilerin karma normalizasyonu
--
-- Migration 108 keşif #1515'in ürün kararı içermeyen kısmını (exam_ref + diakritik)
-- kapattı. Geriye taksonomi kararı gerektiren 114 satır kaldı. Karar (Turgut,
-- 2026-08-10): **karma** — müfredat karşılığı olanı mevcut kanonik kategoriye katla,
-- gerçek bir sınav dersi olanı kanonik listeye ekle.
--
--   cebir  (53) -> AYT: fonksiyonlar | LGS: konu bazlı problemler / denklemler
--   veri   (28) -> olasilik   (TR müfredatı "Veri, Sayma ve Olasılık" olarak birlikte anıyor)
--   inkılap_tarihi (12) -> tarih      (hepsi tarih konusu; LGS'de ayrı ders adı)
--   vatandaşlık     (8) -> sosyoloji  (anayasa/insan hakları/sivil toplum içerikli)
--   din_kulturu    (13) -> DEĞİŞMEZ   (gerçek LGS+TYT dersi; games.ts kanonik listesine eklendi)
--
-- 106'dan sonra questions metadata'sı immutable revision üzerinden yayımlanır.
-- Bu nedenle 109 yalnız questions.category alanını değiştirmez: 108'in daha önce
-- değiştirdiği exam_ref/category satırları dahil her metadata farkı için yeni bir
-- sistem revision'ı üretir, kaynak/outcome kanıtını taşır ve pointer'ı atomik çevirir.

BEGIN;

CREATE TABLE IF NOT EXISTS public._backup_questions_taxonomy_109_20260810 (
  id                        uuid PRIMARY KEY,
  change_scope              text NOT NULL CHECK (
    change_scope IN ('migration_109', 'migration_108_revision_repair')
  ),
  old_category              varchar(50),
  new_category              varchar(50),
  old_exam_ref              varchar(20),
  new_exam_ref              varchar(20),
  old_published_revision_id uuid,
  new_published_revision_id uuid,
  backed_up_at              timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public._backup_questions_taxonomy_109_20260810 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_questions_taxonomy_109_20260810
  FROM PUBLIC, anon, authenticated, service_role;

-- Publish/quarantine RPC'leriyle aynı transaction-local guard. Üretimde
-- enforcement açık olsa bile migration doğrudan metadata güncellemesinde takılmaz.
-- Aşağıdaki revision backfill'i bu geçişi denetlenebilir ve immutable tutar.
DO $migration$
BEGIN
  PERFORM set_config('app.content_governance_publish', 'on', true);

  -- Aynı soruya eşzamanlı revision yayımlanmasını engelle. 108'in yedek tablosu,
  -- yalnız exam_ref/category normalizasyonu görmüş satırları güvenli biçimde sınırlar.
  PERFORM q.id
  FROM public.questions q
  LEFT JOIN public._backup_questions_taxonomy_20260810 b108 ON b108.id = q.id
  WHERE (q.game = 'matematik' AND q.category IN ('cebir', 'veri'))
     OR (q.game = 'sosyal' AND q.category IN ('inkılap_tarihi', 'vatandaşlık'))
     OR b108.id IS NOT NULL
  ORDER BY q.id
  FOR UPDATE OF q;
END;
$migration$;

INSERT INTO public._backup_questions_taxonomy_109_20260810 (
  id, change_scope, old_category, old_exam_ref, old_published_revision_id
)
SELECT
  q.id,
  CASE
    WHEN (q.game = 'matematik' AND q.category IN ('cebir', 'veri'))
      OR (q.game = 'sosyal' AND q.category IN ('inkılap_tarihi', 'vatandaşlık'))
    THEN 'migration_109'
    ELSE 'migration_108_revision_repair'
  END,
  q.category,
  q.exam_ref,
  q.published_revision_id
FROM public.questions q
LEFT JOIN public._backup_questions_taxonomy_20260810 b108 ON b108.id = q.id
WHERE (q.game = 'matematik' AND q.category IN ('cebir', 'veri'))
   OR (q.game = 'sosyal' AND q.category IN ('inkılap_tarihi', 'vatandaşlık'))
   OR b108.id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- 1) matematik/cebir — AYT: fonksiyon analizi ailesi
UPDATE public.questions
SET category = 'fonksiyonlar'
WHERE game = 'matematik' AND category = 'cebir'
  AND exam_ref IN ('AYT-SAY', 'AYT-EA');

-- 2) matematik/cebir — LGS: oran-orantı ve yüzde/faiz kurulumları problemdir
UPDATE public.questions
SET category = 'problemler'
WHERE game = 'matematik' AND category = 'cebir'
  AND topic IN ('Oran ve Orantı Problemleri', 'Yüzde, Faiz ve Kar-Zarar');

-- 3) matematik/cebir — LGS: kalan denklem/eşitsizlik kurulumları
UPDATE public.questions
SET category = 'denklemler'
WHERE game = 'matematik' AND category = 'cebir'
  AND topic IN ('Denklemler ve Eşitsizlikler', 'İki Bilinmeyenli Denklem', 'Örüntü ve Denklem');

-- 4) matematik/veri -> olasilik (istatistik + olasılık aynı müfredat ünitesi)
UPDATE public.questions
SET category = 'olasilik'
WHERE game = 'matematik' AND category = 'veri';

-- 5) sosyal/inkılap_tarihi -> tarih
UPDATE public.questions
SET category = 'tarih'
WHERE game = 'sosyal' AND category = 'inkılap_tarihi';

-- 6) sosyal/vatandaşlık -> sosyoloji
UPDATE public.questions
SET category = 'sosyoloji'
WHERE game = 'sosyal' AND category = 'vatandaşlık';

-- Revision üretmeden önce beklenmedik content/metadata farkında fail-closed davran.
-- 108/109 yalnız category ve exam_ref değiştirir; diğer alanların farklı olması
-- denetimsiz bir içerik değişikliğini yanlışlıkla yayımlamak anlamına gelir.
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public._backup_questions_taxonomy_109_20260810 b
    JOIN public.questions q ON q.id = b.id
    LEFT JOIN public.question_content_revisions r ON r.id = q.published_revision_id
    WHERE r.id IS NULL
       OR r.status <> 'published'
       OR q.content IS DISTINCT FROM r.content
       OR q.game IS DISTINCT FROM r.game
       OR q.subcategory IS DISTINCT FROM r.subcategory
       OR q.topic IS DISTINCT FROM r.topic
       OR q.difficulty IS DISTINCT FROM r.difficulty
       OR q.level_tag IS DISTINCT FROM r.level_tag
       OR q.is_boss IS DISTINCT FROM r.is_boss
       OR NOT EXISTS (
         SELECT 1 FROM public.question_revision_sources s
         WHERE s.revision_id = r.id
       )
  ) THEN
    RAISE EXCEPTION
      'Migration 109: taxonomy hedefinde yayımlanabilir revision/source bütünlüğü yok'
      USING ERRCODE = '55000';
  END IF;
END;
$migration$;

CREATE TEMP TABLE taxonomy_revision_targets ON COMMIT DROP AS
SELECT
  b.id AS question_id,
  b.change_scope,
  q.published_revision_id AS old_revision_id,
  gen_random_uuid() AS new_revision_id,
  (
    SELECT COALESCE(max(existing.revision_no), 0) + 1
    FROM public.question_content_revisions existing
    WHERE existing.question_id = q.id
  ) AS revision_no
FROM public._backup_questions_taxonomy_109_20260810 b
JOIN public.questions q ON q.id = b.id
JOIN public.question_content_revisions r ON r.id = q.published_revision_id
WHERE (
  q.game, q.category, q.subcategory, q.topic, q.difficulty,
  q.level_tag, q.exam_ref, q.is_boss, q.content
) IS DISTINCT FROM (
  r.game, r.category, r.subcategory, r.topic, r.difficulty,
  r.level_tag, r.exam_ref, r.is_boss, r.content
);

INSERT INTO public.question_content_revisions (
  id, question_id, revision_no, base_revision_id,
  game, category, subcategory, topic, difficulty, level_tag, exam_ref, is_boss,
  content, content_sha256, change_kind, change_summary,
  status, prepared_by, published_at
)
SELECT
  t.new_revision_id,
  q.id,
  t.revision_no,
  t.old_revision_id,
  q.game,
  q.category,
  q.subcategory,
  q.topic,
  q.difficulty,
  q.level_tag,
  q.exam_ref,
  q.is_boss,
  r.content,
  r.content_sha256,
  'legacy_import',
  CASE t.change_scope
    WHEN 'migration_109' THEN 'Migration 109 canonical category normalization'
    ELSE 'Migration 108 taxonomy metadata revision repair'
  END,
  'published',
  NULL,
  clock_timestamp()
FROM pg_temp.taxonomy_revision_targets t
JOIN public.questions q ON q.id = t.question_id
JOIN public.question_content_revisions r ON r.id = t.old_revision_id;

INSERT INTO public.question_revision_sources (
  revision_id, source_kind, source_title, source_url,
  license_code, license_url, attribution, provenance_ref
)
SELECT
  t.new_revision_id,
  s.source_kind,
  s.source_title,
  s.source_url,
  s.license_code,
  s.license_url,
  s.attribution,
  s.provenance_ref
FROM pg_temp.taxonomy_revision_targets t
JOIN public.question_revision_sources s ON s.revision_id = t.old_revision_id;

INSERT INTO public.question_revision_outcomes (
  revision_id, outcome_id, weight, is_primary
)
SELECT t.new_revision_id, o.outcome_id, o.weight, o.is_primary
FROM pg_temp.taxonomy_revision_targets t
JOIN public.question_revision_outcomes o ON o.revision_id = t.old_revision_id;

UPDATE public.question_content_revisions old_revision
SET status = 'superseded'
FROM pg_temp.taxonomy_revision_targets t
WHERE old_revision.id = t.old_revision_id
  AND old_revision.status = 'published';

UPDATE public.questions q
SET published_revision_id = t.new_revision_id
FROM pg_temp.taxonomy_revision_targets t
WHERE q.id = t.question_id;

INSERT INTO public.question_governance_events (
  question_id, revision_id, actor_id, event_type, public_reason, private_note
)
SELECT
  t.question_id,
  t.new_revision_id,
  NULL,
  'published',
  'Soru taksonomisi kanonik kategoriye taşındı.',
  'Migration 109 system taxonomy normalization; content and answer key unchanged.'
FROM pg_temp.taxonomy_revision_targets t;

UPDATE public._backup_questions_taxonomy_109_20260810 b
SET
  new_category = q.category,
  new_exam_ref = q.exam_ref,
  new_published_revision_id = q.published_revision_id
FROM public.questions q
WHERE q.id = b.id;

-- Guard: din_kulturu DIŞINDA kanonik-dışı kategori kalmamalı ve her hedefin
-- questions metadata'sı yayımlanmış immutable revision ile birebir olmalı.
DO $migration$
DECLARE
  kalan integer;
  ornek text;
BEGIN
  SELECT count(*), COALESCE(string_agg(DISTINCT game || '/' || COALESCE(category, 'NULL'), ', '), '')
  INTO kalan, ornek
  FROM public.questions
  WHERE (game = 'matematik' AND (
          category IS NULL OR category NOT IN
            ('sayilar','problemler','geometri','denklemler','fonksiyonlar','olasilik')
        ))
     OR (game = 'sosyal' AND (
          category IS NULL OR category NOT IN
            ('tarih','cografya','felsefe','sosyoloji','din_kulturu')
        ));

  IF kalan <> 0 THEN
    RAISE EXCEPTION 'Migration 109: % satir hala kanonik disi (%)', kalan, ornek;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public._backup_questions_taxonomy_109_20260810 b
    JOIN public.questions q ON q.id = b.id
    LEFT JOIN public.question_content_revisions r ON r.id = q.published_revision_id
    WHERE r.id IS NULL
       OR r.status <> 'published'
       OR (
         q.game, q.category, q.subcategory, q.topic, q.difficulty,
         q.level_tag, q.exam_ref, q.is_boss, q.content
       ) IS DISTINCT FROM (
         r.game, r.category, r.subcategory, r.topic, r.difficulty,
         r.level_tag, r.exam_ref, r.is_boss, r.content
       )
       OR NOT EXISTS (
         SELECT 1 FROM public.question_revision_sources s
         WHERE s.revision_id = r.id
       )
  ) THEN
    RAISE EXCEPTION
      'Migration 109: questions ile yayımlanmış revision metadata uyumsuz'
      USING ERRCODE = '55000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.taxonomy_revision_targets t
    JOIN public.question_content_revisions old_revision ON old_revision.id = t.old_revision_id
    WHERE old_revision.status <> 'superseded'
  ) THEN
    RAISE EXCEPTION 'Migration 109: önceki revision superseded değil'
      USING ERRCODE = '55000';
  END IF;
END;
$migration$;

COMMIT;

NOTIFY pgrst, 'reload schema';
