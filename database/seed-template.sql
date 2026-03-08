-- ============================================================
-- BİLGE ARENA — Soru Yükleme Şablonu
-- WordQuest (İngilizce) — 635 soru
-- ============================================================
-- Bu dosya questions tablosuna veri yüklemek için şablon gösterir.
-- Gerçek yükleme: seed.js scripti ile yapılır.
-- ============================================================

-- Zorluk haritası
-- vocabulary      → difficulty 2 (Kolay)
-- phrasal_verbs   → difficulty 2 (Kolay)
-- grammar         → difficulty 3 (Orta)
-- sentence_comp   → difficulty 3 (Orta)
-- restatement     → difficulty 3 (Orta)
-- cloze_test      → difficulty 4 (Zor)
-- dialogue        → difficulty 3 (Orta)

-- Örnek insert formatı (tek soru):
/*
INSERT INTO questions (external_id, game, category, difficulty, level_tag, content, source)
VALUES (
  'vocabulary_001',
  'wordquest',
  'vocabulary',
  2,
  'B1',
  '{
    "type": "multiple_choice",
    "sentence": "The scientist made a significant ---- in cancer research.",
    "options": ["breakthrough","breakdown","breakout","breakup","breakoff"],
    "correct": 0,
    "explanation": "Breakthrough = önemli bir ilerleme/buluş",
    "hint": "Bileşik kelime: break + through"
  }'::JSONB,
  'original'
);
*/

-- Toplu yükleme için seed.js kullanın (aşağıdaki yapıda):
-- node database/seed.js

-- ============================================================
-- Faydalı sorgular
-- ============================================================

-- Oyuna göre soru sayısı
-- SELECT game, category, COUNT(*) FROM questions GROUP BY game, category ORDER BY game, category;

-- Zorluk dağılımı
-- SELECT difficulty, COUNT(*), ROUND(COUNT(*)*100.0/SUM(COUNT(*)) OVER(), 1) AS pct
-- FROM questions GROUP BY difficulty ORDER BY difficulty;

-- En çok yanlış yapılan sorular
-- SELECT q.external_id, q.category, q.times_answered, q.times_correct,
--        ROUND((1 - q.times_correct::NUMERIC/NULLIF(q.times_answered,0))*100,1) AS wrong_pct
-- FROM questions q WHERE q.times_answered > 10
-- ORDER BY wrong_pct DESC LIMIT 20;

-- Kullanıcı için sıradaki sorular (görülmemiş veya eski)
-- SELECT q.* FROM questions q
-- LEFT JOIN user_question_history uqh ON q.id = uqh.question_id AND uqh.user_id = $1
-- WHERE q.game = $2 AND q.is_active = TRUE
--   AND (uqh.last_seen_at IS NULL OR uqh.last_seen_at < NOW() - INTERVAL '3 days')
-- ORDER BY RANDOM() LIMIT 10;
