-- disc#1296 istatistik onarimi — TEK ATOMIK STATEMENT (PR#264 Codex re-review sonrasi mimari).
--
-- NEDEN TEK SQL (eski .mjs satir-satir yazma yerine):
--   1. Live-race penceresi 70sn'den statement-suresine (~ms) iner. DIKKAT — TAM kapanmaz
--      (Codex 4. tur, dogrulandi): READ COMMITTED'de eszamanli batch_increment bizim
--      snapshot'imizdan sonra ama row-lock'umuzdan once commit olursa, EvalPlanQual
--      yalniz WHERE'i yeniden degerlendirir, FROM-subquery'deki t.ta/t.tc'yi YENIDEN
--      HESAPLAMAZ -> o delta absolute-SET tarafindan ezilebilir.
--   2. Pagination yok: >1000 satirda order'siz range'in atlama/cift-sayma riski kalkar.
--   3. Idempotent: kac kez kosarsa kossun ayni trusted-set ayni sonucu verir.
--
-- RESIDUAL-RACE PROSEDURU (bakim-penceresine gerek birakmayan operasyonel kapama):
--   apply -> HEMEN dry-run raporu kos (.mjs, ayni --bug-start/--bug-end) ->
--   "Sayaci degisecek soru: 0" ise race olusmamistir, BITTI; >0 ise tekrar apply.
--   Idempotent recompute + statement-suresi(ms) << cevap-gelis-araligi oldugu icin
--   dongu pratikte 1-2 turda yakinsar (mevcut trafik ~0.2 oturum/gun).
--
-- SEMANTIK (prod-parite, migration 022 batch_increment_question_stats ile birebir):
--   times_answered = COUNT(*)        -> SKIP DAHIL (is_skipped filtresi YOK)
--   times_correct  = COUNT(*) FILTER (WHERE is_correct)
--
-- PENCERE PARAMETRELERI — kosmadan once IKISINI DE gercek degerlerle degistir:
--   :BUG_START = bug'li client'in GERCEK deploy ani (93172c6, 2026-04-14). Gun-basi
--                kullanilirsa o gun deploy-ONCESI gecerli cevaplar da dislanir (Codex#3);
--                kesin saat bilinmiyorsa gun-basi KABUL edilebilir kayip (o sabah ~birkac cevap).
--   :BUG_END   = fix'in (PR#264) GERCEK Vercel deploy ani. "now" KULLANMA — gec kosulan
--                onarim post-fix gecerli veriyi dislar.
--
-- Kullanim: Supabase SQL editor / MCP execute_sql. Once dry-run raporu icin:
--   node database/repair-question-stats.mjs --bug-start=<ISO> --bug-end=<ISO>

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
    WHERE answered_at < ':BUG_START'::timestamptz
       OR answered_at >= ':BUG_END'::timestamptz
    GROUP BY question_id
  ) tr ON tr.question_id = qq.id
) t
WHERE q.id = t.qid
  AND (q.times_answered IS DISTINCT FROM COALESCE(t.ta, 0)
       OR q.times_correct IS DISTINCT FROM COALESCE(t.tc, 0));
