-- disc#1370 (konu#7 S3) — questions.times_answered/times_correct TAM YENIDEN-HESAPLAMA
--
-- NEDEN (bkz. database/migrations/082_single_question_stats_writer.sql basi icin
-- tam bug/karar notu): migration 082'den ONCE, session_answers'a her INSERT'te
-- questions sayaclari IKI bagimsiz yoldan artiyordu (trg_answer_stats trigger'i +
-- complete_game_session RPC'sinin nested batch_increment_question_stats cagrisi).
-- Bu, GECMISTEKI tum sayaclari kirletti -- cift-sayim (gozlemlenen: tek cevapli
-- soruda sayac=2, gercek=1) VE muhtemelen daha eski bir yazma-yolundan kalma ters
-- yonlu drift (gozlemlenen: bir soruda sayac=3, gercek=5) ayni anda mevcut.
--
-- database/repair-question-stats.sql'den (disc#1296) FARKI: o script bir BUG
-- PENCERESI icindeki (shuffle-index bug'i, 93172c6..PR#264) satirlari "trusted
-- degil" sayip ONLARI DISLIYORDU (pencere-disi + is_skipped satirlar trusted).
-- BU script pencere-bagimsiz: disc#1370 double-count her zaman aktifti (081
-- deploy'undan beri, WINDOW YOK) -- dolayisiyla TUM session_answers gecmisi
-- guvenilir kaynak, hicbir satir dislanmiyor. TAM RECOMPUTE.
--
-- SEMANTIK (batch_increment_question_stats, migration 022 ile birebir esitlenir --
-- complete_game_session RPC'sine giden p_answers TUM cevaplari icerir, is_skipped
-- dahil, bkz. 081 satir 146-157/160-163 ve 022 satir 15-26 -- is_skipped filtresi
-- YOK, bilerek):
--   times_answered = COUNT(*)                          (skip dahil, tum satirlar)
--   times_correct  = COUNT(*) FILTER (WHERE is_correct)
--
-- IDEMPOTENT: kac kez kosarsa kossun ayni (dogru) sonucu verir -- degisen satir
-- yoksa 0 row etkilenir (WHERE'deki IS DISTINCT FROM guard'i).
--
-- Numarali migration'a GOMULMEZ (082 kalici DDL/tek-yazar-ayrimi; bu script
-- operasyonel bir veri-onarimi, tek seferlik calistirilir). Sira ONEMLI:
-- 082'DEN SONRA calistirilmali (bkz. docs/runbooks/2026-07-21-mig-082-apply.md) --
-- aksi halde 082 uygulanmadan gelen cevaplar bu recompute'tan SONRA yine cift
-- sayilmaya devam eder ve onarim tekrar bozulur.
--
-- Kullanim: Supabase Dashboard SQL Editor / MCP execute_sql. Once dry-run icin
-- WHERE blogunu bir SELECT'e cevirip etkilenecek satir sayisini/farki gozden
-- gecirmek onerilir (asagida ayri bir SELECT ornegi var).

-- --- Dry-run (yalniz raporla, hicbir sey yazmaz) ---
-- SELECT
--   q.id, q.times_answered AS eski_answered, q.times_correct AS eski_correct,
--   COALESCE(t.ta, 0) AS gercek_answered, COALESCE(t.tc, 0) AS gercek_correct
-- FROM questions q
-- LEFT JOIN (
--   SELECT question_id,
--          COUNT(*)::int AS ta,
--          COUNT(*) FILTER (WHERE is_correct)::int AS tc
--   FROM session_answers
--   GROUP BY question_id
-- ) t ON t.question_id = q.id
-- WHERE q.times_answered IS DISTINCT FROM COALESCE(t.ta, 0)
--    OR q.times_correct  IS DISTINCT FROM COALESCE(t.tc, 0)
-- ORDER BY ABS(q.times_answered - COALESCE(t.ta, 0)) DESC;

-- --- Apply (gercek yazma) ---
UPDATE questions q
SET times_answered = COALESCE(t.ta, 0),
    times_correct  = COALESCE(t.tc, 0)
FROM (
  SELECT qq.id AS qid, tr.ta, tr.tc
  FROM questions qq
  LEFT JOIN (
    SELECT question_id,
           COUNT(*)::int AS ta,
           COUNT(*) FILTER (WHERE is_correct)::int AS tc
    FROM session_answers
    GROUP BY question_id
  ) tr ON tr.question_id = qq.id
) t
WHERE q.id = t.qid
  AND (q.times_answered IS DISTINCT FROM COALESCE(t.ta, 0)
       OR q.times_correct IS DISTINCT FROM COALESCE(t.tc, 0));
