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
-- cebir tek bir kategoriye karşılık gelmiyor: AYT tarafı türev/integral/limit/
-- logaritma/diziler (fonksiyon analizi), LGS tarafı ise oran-orantı + denklem
-- karışımı. Bu yüzden LGS satırları KONU bazında ayrılıyor. Konu dizeleri birebir
-- eşleşmezse sondaki guard migration'ı geri alır — sessizce yarım kalmaz.

BEGIN;

CREATE TABLE IF NOT EXISTS public._backup_questions_taxonomy_109_20260810 (
  id           uuid PRIMARY KEY,
  old_category varchar(50),
  backed_up_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

REVOKE ALL ON public._backup_questions_taxonomy_109_20260810 FROM PUBLIC, anon, authenticated;

INSERT INTO public._backup_questions_taxonomy_109_20260810 (id, old_category)
SELECT id, category
FROM public.questions
WHERE (game = 'matematik' AND category IN ('cebir', 'veri'))
   OR (game = 'sosyal'    AND category IN ('inkılap_tarihi', 'vatandaşlık'))
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

-- Guard: din_kulturu DIŞINDA kanonik-dışı kategori kalmamalı. Konu dizesi
-- tutmayan bir cebir satırı kalırsa burada patlar ve her şey geri alınır.
DO $migration$
DECLARE
  kalan integer;
  ornek text;
BEGIN
  SELECT count(*), COALESCE(string_agg(DISTINCT game || '/' || category, ', '), '')
  INTO kalan, ornek
  FROM public.questions
  WHERE (game = 'matematik' AND category NOT IN
          ('sayilar','problemler','geometri','denklemler','fonksiyonlar','olasilik'))
     OR (game = 'sosyal' AND category NOT IN
          ('tarih','cografya','felsefe','sosyoloji','din_kulturu'));

  IF kalan <> 0 THEN
    RAISE EXCEPTION 'Migration 109: % satir hala kanonik disi (%)', kalan, ornek;
  END IF;
END;
$migration$;

COMMIT;
