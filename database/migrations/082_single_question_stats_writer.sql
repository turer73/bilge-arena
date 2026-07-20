-- Migration 082: questions.times_answered/times_correct icin tek-yazar ayrimi (disc#1370, konu#7 karari S3)
--
-- BUG (prod'da ampirik olarak dogrulandi): session_answers'a HER INSERT'te
-- questions.times_answered/times_correct IKI bagimsiz yoldan artiyordu:
--   1. trg_answer_stats trigger'i (full-schema.sql:572-573, AFTER INSERT ON
--      session_answers) -> update_question_stats() (full-schema.sql:553-570) ->
--      hem questions sayaclarini +1 artiriyor HEM DE user_question_history'ye
--      upsert yapiyor.
--   2. complete_game_session RPC'sinin (migration 081, satir 159-163) nested
--      cagirdigi batch_increment_question_stats (migration 022) -> AYNI cevap
--      seti icin questions sayaclarini TEKRAR artiriyor.
-- Ikisi de ayni transaction icinde, ayni INSERT'e tepki olarak calisiyor ->
-- her cevap questions tablosunda IKI KEZ sayiliyor.
--
-- KANIT: tum-zamanlar tek cevapli bir soruda times_answered=2 iken gercek
-- session_answers COUNT(*)=1 olarak dogrulandi (disc#1370). Sayac gecmisi
-- ayrica genel olarak kirli: ters yonlu drift de gozlemlendi (bir soruda
-- sayac=3, gercek COUNT=5) -- muhtemelen 081 oncesi farkli bir yazma-yolu/
-- kismi-hata izinden kalma. Bu migration ILERI-YONE tek-yazar garantisi
-- verir; GECMIS kirliligi ayri bir operasyonel repair script'i temizler
-- (asagida "Repair" notu).
--
-- KARAR (Tartisma Platformu konu#7, sentez S3 -- Turgut onayi): TEK-YAZAR
-- AYRIMI. questions.* sayaclarinin TEK yazari batch_increment_question_stats
-- (complete_game_session RPC'sinden cagirilan, migration 022) olarak KALIR.
-- update_question_stats() trigger-fonksiyonundan SADECE questions UPDATE
-- blogu KALDIRILIR; user_question_history upsert'i (kullanicinin kisisel
-- soru-gecmisi -- batch_increment_question_stats bu tabloya HIC dokunmuyor,
-- yalniz update_question_stats yaziyor) AYNEN korunur.
--
-- KAPSAM DISI (bilincli): trg_answer_stats trigger'inin kendisi (full-schema.sql:573)
-- degismiyor -- yalniz cagirdigi fonksiyonun govdesi degisiyor. complete_game_session
-- RPC'sine (migration 081, database/migrations/081_atomic_complete_game_session.sql)
-- DOKUNULMUYOR. batch_increment_question_stats fonksiyonuna (migration 022) DOKUNULMUYOR.
--
-- FORENSIC -- batch_increment_question_stats'in TUM cagiranlari (src/ + database/
-- tamami grep'lendi, disc#1370 hazirligi):
--   * TEK cagiran: complete_game_session RPC (migration 081, satir 160-163).
--   * src/ icinde bu fonksiyona dogrudan cagri YOK (grep: "batch_increment_question_stats"
--     ve "update_question_stats" -- src/ altinda 0 sonuc). Client/route.ts kodu bu
--     RPC'leri hic bilmiyor, yalniz complete_game_session'i cagiriyor (sessions/route.ts).
--   * session_answers'a INSERT eden TEK yol: complete_game_session RPC'si (migration
--     081, satir 146-157). Migration 074 (REVOKE ALL ... FROM anon) ve 075
--     (REVOKE ALL ... FROM authenticated) session_answers uzerindeki TUM client
--     (anon+authenticated) DML yetkisini kaldirmis durumda -- bu dogrulandi (dosyalar
--     okundu, varsayilmadi): 074 satir 17 + 075 satir 21, ikisi de
--     "REVOKE ALL ON public.session_answers FROM <rol>". Yani session_answers'a
--     yazma artik YALNIZ service-role SECURITY DEFINER RPC'ler (complete_game_session)
--     uzerinden mumkun -- eski/dogrudan .from('session_answers').insert() yolu YOK.
--   * Migration 018 (increment_question_stats, tekil-satir RPC, batch'in selefi)
--     src/'de cagrilmiyor (grep: 0 sonuc) -- olu kod, bu migration'in kapsami degil.
--   * Sonuc: tek-yazar ayrimi TUM yollari kapsiyor -- session_answers'a giren HER
--     cevap complete_game_session uzerinden gecmek ZORUNDA, dolayisiyla
--     questions.* sayaclarinin tek kaynagi batch_increment_question_stats olacak.
--
-- SECURITY DEFINER + search_path (migration 007/030 sablonu korunur -- 030'un
-- ALTER FUNCTION ... SET search_path dinamik-tarama'si SADECE proconfig BOS
-- fonksiyonlari hedefler; CREATE OR REPLACE FUNCTION eski proconfig'i KORUMAZ,
-- bu yuzden search_path burada YENIDEN, ACIKCA tanimlaniyor -- aksi halde 030'un
-- kapadigi "Function Search Path Mutable" aciligi bu migration'la yeniden acilirdi):
--
-- Repair (bu migration'a GOMULMEZ -- numarali migration'lar kalici DDL, repair
-- operasyonel bir script): gecmis kirliligi (cift-sayim + varsa ters-yonlu drift)
-- database/repair-question-stats-2.sql ile ayrica, bu migration'dan SONRA
-- calistirilmali (bkz. docs/runbooks/2026-07-21-mig-082-apply.md).
--
-- Rollback:
--   BEGIN;
--     CREATE OR REPLACE FUNCTION public.update_question_stats()
--     RETURNS TRIGGER
--     LANGUAGE plpgsql
--     SECURITY DEFINER
--     SET search_path TO 'public'
--     AS $$
--     BEGIN
--       UPDATE questions SET
--         times_answered = times_answered + 1,
--         times_correct  = times_correct + (CASE WHEN NEW.is_correct THEN 1 ELSE 0 END)
--       WHERE id = NEW.question_id;
--
--       INSERT INTO user_question_history (user_id, question_id, times_seen, times_correct, last_seen_at)
--       VALUES (NEW.user_id, NEW.question_id, 1, CASE WHEN NEW.is_correct THEN 1 ELSE 0 END, NOW())
--       ON CONFLICT (user_id, question_id) DO UPDATE SET
--         times_seen    = user_question_history.times_seen + 1,
--         times_correct = user_question_history.times_correct + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
--         last_seen_at  = NOW();
--
--       RETURN NEW;
--     END;
--     $$;
--   COMMIT;
--   -- UYARI: rollback cift-sayim bug'ini GERI GETIRIR (trg_answer_stats +
--   -- batch_increment_question_stats yeniden ayni cevabi iki kez sayar).
--   -- Yalniz bu migration'in beklenmedik bir yan-etkisi tespit edilirse kullan.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_question_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- questions.times_answered/times_correct ARTIK BURADAN YAZILMIYOR -- tek
  -- yazar batch_increment_question_stats (migration 022, complete_game_session
  -- RPC'sinden nested cagrilir, migration 081 satir 160-163). Bkz. bu dosyanin
  -- basindaki bug/karar notu (disc#1370, konu#7 S3).

  -- user_question_history upsert'i AYNEN korunur -- batch_increment_question_stats
  -- bu tabloya hic dokunmuyor, kullanicinin kisisel soru-gecmisi icin tek yazar
  -- burasi.
  INSERT INTO user_question_history (user_id, question_id, times_seen, times_correct, last_seen_at)
  VALUES (NEW.user_id, NEW.question_id, 1, CASE WHEN NEW.is_correct THEN 1 ELSE 0 END, NOW())
  ON CONFLICT (user_id, question_id) DO UPDATE SET
    times_seen    = user_question_history.times_seen + 1,
    times_correct = user_question_history.times_correct + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
    last_seen_at  = NOW();

  RETURN NEW;
END;
$$;

-- trg_answer_stats trigger'inin kendisi DEGISMIYOR (full-schema.sql:572-573 ile
-- ayni tanim) -- yalniz cagirdigi fonksiyonun govdesi yukarida degisti. Idempotent
-- DROP+CREATE ile tekrar beyan ediliyor (lint-migrations.mjs kurali: CREATE TRIGGER
-- oncesi DROP TRIGGER IF EXISTS sart).
DROP TRIGGER IF EXISTS trg_answer_stats ON public.session_answers;
CREATE TRIGGER trg_answer_stats AFTER INSERT ON public.session_answers FOR EACH ROW EXECUTE FUNCTION public.update_question_stats();

NOTIFY pgrst, 'reload schema';

COMMIT;
