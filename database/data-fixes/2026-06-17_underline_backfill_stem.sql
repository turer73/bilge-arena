-- Data-fix (2026-06-17): "altı çizili sözcük" sorularinda altcizgi backfill — STEM tipi
--
-- Sorun (Ensar bildirdi): "...altı çizili sözcük hangi anlamda..." tipi sorularda
--   hedef kelime gorsel altcizili olmasi gerekirken `content.question` DUZ METIN;
--   altcizgi bilgisi import'ta (source=tyt_full_bank) kaybolmus. 23 soru / 19 distinct,
--   hicbirinde markup yok. Renderer da duz metindi.
--
-- Cozum: (1) renderer'a guvenli <u>...</u> destegi (src/lib/utils/rich-text.tsx,
--   tum soru render site'larina uygulandi), (2) bu backfill — STEM tipi 12 distinct
--   soruda hedef kelimeyi <u>...</u> ile isaretler. Hedef kelime solution'dan turetildi.
--
-- SIRA ONEMLI: once renderer prod'a deploy edilmeli, SONRA bu backfill calistirilmali.
--   Aksi halde deployed-renderer <u>'yu parse etmedigi icin ham etiket gorunur.
--   (Bu PR merge + Vercel deploy sonrasi MCP execute_sql ile uygulandi.)
--
-- Idempotent: NOT LIKE '%<u>%' guard'i ile tekrar calistirilabilir.
-- Geri alma: replace(replace(q,'<u>',''),'</u>','') ile <u> etiketleri cikarilir.
--
-- KAPSAM DISI (ikinci tur): "Asagidaki cumlelerin hangisinde alti cizili..." (option
--   tipi, altcizgi her secenekte ayri — ~5 soru), "Sicak I/II/III/IV" somut sorusu,
--   FEN "alti cizili atom" sorusu, duplikasyon temizligi, self-broken "yerinde
--   kullanilmamistir" sorusu (solution'i kendi "revize edilebilir" diyor).

WITH fixes(substr, target, replacement) AS (
  VALUES
    ('kazınıp kaldı', 'kazınıp', '<u>kazınıp</u>'),
    ('hayat kattılar', 'hayat kattılar', '<u>hayat kattılar</u>'),
    ('çözmek için toplu', 'çözmek için', 'çözmek <u>için</u>'),
    ('Ankara bu kararı', 'Ankara', '<u>Ankara</u>'),
    ('aklı başında biri', 'aklı başında', '<u>aklı başında</u>'),
    ('yeter ki yağmur yağmasın', 'yeter ki yağmur yağmasın', '<u>yeter ki yağmur yağmasın</u>'),
    ('Erken kalktım, böylece', 'böylece', '<u>böylece</u>'),
    ('ne var ki yeni iş', 'ne var ki', '<u>ne var ki</u>'),
    ('sakin ve yapıcı bir tavır', 'sakin ve yapıcı bir tavır', '<u>sakin ve yapıcı bir tavır</u>'),
    ('Yazan kişi dikkatli', 'Yazan kişi', '<u>Yazan</u> kişi'),
    ('Ankara bu konuda karar', 'Ankara', '<u>Ankara</u>'),
    ('Eli açık biri olduğu', 'Eli açık', '<u>Eli açık</u>')
)
UPDATE questions q
SET content = jsonb_set(q.content, '{question}', to_jsonb(replace(q.content->>'question', f.target, f.replacement)))
FROM fixes f
WHERE q.content->>'question' ILIKE '%' || f.substr || '%'
  AND q.content->>'question' NOT LIKE '%<u>%';
