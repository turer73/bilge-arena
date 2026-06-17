-- Data-fix (2026-06-17): "altı çizili" 2. tur — OPTION-tipi + stem-multi + reword/deaktive
--
-- 1. tur (ayrı dosya: 2026-06-17_underline_backfill_stem.sql) tek-kelime stem
-- sorularını <u> ile işaretledi. 2. tur kalan tipleri kapatır.
--
-- ÖNKOŞUL: option-renderer (PR#229) prod'a deploy edilmeli — renderRichText
--   OptionButton + tüm modlarda. Aksi halde seçenek <u>'ları ham görünür.
--   (Bu backfill PR#229 Vercel-READY sonrası MCP execute_sql ile uygulandı.)
--
-- #4 sıcak I-IV (stem-multi, id 64860e1c): question'da 4x Sıcak/sıcak <u>.
-- #5 "yerinde kullanılmamıştır" (id 24a34618): is_active=false — solution'ı kendi
--    "bu soru revize edilebilir" diyor (self-broken, reconstruct edilemez).
-- #1 FEN atom (id 5fdf2ace): "altı çizili atom" -> "parantez içinde belirtilen atom"
--    (seçeneklerde "(Mn)" paren atomu zaten gösteriyor; $_2$ LaTeX AYRI sorun).
-- #2/#3/#6: altçizgi SEÇENEKLERDE, hedef kelimeler solution/desenden türetildi.
--
-- Idempotent: content::text NOT LIKE '%<u>%' guard.

-- #4 sıcak stem
UPDATE questions SET content = jsonb_set(content, '{question}',
  to_jsonb(replace(replace(content->>'question', 'Sıcak', '<u>Sıcak</u>'), 'sıcak', '<u>sıcak</u>')))
WHERE id='64860e1c-dd9c-47d0-b4b8-f50b861b671d' AND content->>'question' NOT LIKE '%<u>%';

-- #5 self-broken deaktive
UPDATE questions SET is_active=false WHERE id='24a34618-bac7-4d29-9786-a27c03b7d126';

-- #1 FEN reword
UPDATE questions SET content = jsonb_set(content, '{question}',
  to_jsonb(replace(content->>'question', 'altı çizili atom', 'parantez içinde belirtilen atom')))
WHERE id='5fdf2ace-cc0b-486f-933d-7a8928d4b166';

-- #3 "güzel" (uniform)
UPDATE questions q SET content = jsonb_set(q.content, '{options}',
  (SELECT jsonb_agg(to_jsonb(replace(replace(elem,'Güzel','<u>Güzel</u>'),'güzel','<u>güzel</u>')) ORDER BY ord)
   FROM jsonb_array_elements_text(q.content->'options') WITH ORDINALITY AS t(elem, ord)))
WHERE q.id='126c0821-f3e4-4431-b077-e488bbc5daa1' AND q.content::text NOT LIKE '%<u>%';

-- #2 yazım (compound per-seçenek)
UPDATE questions q SET content = jsonb_set(q.content, '{options}',
  (SELECT jsonb_agg(to_jsonb(CASE ord
     WHEN 1 THEN replace(elem,'kahvaltısı','<u>kahvaltısı</u>')
     WHEN 2 THEN replace(elem,'ayakkabı','<u>ayakkabı</u>')
     WHEN 3 THEN replace(elem,'Parmak izi','<u>Parmak izi</u>')
     WHEN 4 THEN replace(elem,'göz altına','<u>göz altına</u>')
     WHEN 5 THEN replace(elem,'dar','<u>dar</u>')
     ELSE elem END) ORDER BY ord)
   FROM jsonb_array_elements_text(q.content->'options') WITH ORDINALITY AS t(elem, ord)))
WHERE q.id='5566a5fb-bd3a-48a8-b2de-e598d6e11910' AND q.content::text NOT LIKE '%<u>%';

-- #6 zıt anlam çiftleri
UPDATE questions q SET content = jsonb_set(q.content, '{options}',
  (SELECT jsonb_agg(to_jsonb(CASE ord
     WHEN 1 THEN replace(replace(elem,'basit','<u>basit</u>'),'karmaşık','<u>karmaşık</u>')
     WHEN 2 THEN replace(replace(elem,'sıcak','<u>sıcak</u>'),'serin','<u>serin</u>')
     WHEN 3 THEN replace(replace(elem,'cömert','<u>cömert</u>'),'senin gibi','<u>senin gibi</u>')
     WHEN 4 THEN replace(replace(elem,'dar','<u>dar</u>'),'geniş','<u>geniş</u>')
     WHEN 5 THEN replace(replace(elem,'kısa','<u>kısa</u>'),'uzun','<u>uzun</u>')
     ELSE elem END) ORDER BY ord)
   FROM jsonb_array_elements_text(q.content->'options') WITH ORDINALITY AS t(elem, ord)))
WHERE q.id='3395068a-da0a-48e7-bfa6-24b47e475649' AND q.content::text NOT LIKE '%<u>%';
