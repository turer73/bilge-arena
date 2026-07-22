-- Migration 084: "Bugunun 15'i" otomatik gunluk calisma plani icin daily_plan tablosu
-- (konu#7 Faz-2, Bilge Arena roadmap P1 -- onayli plan: logical-juggling-brooks)
--
-- AMAC: Kullanici arenaya girince onceden hesaplanmis ~15 soruluk karma bir
-- plan (FSRS-due + zayif-kategori + yeni) gorsun, gun boyu ayni plan sabit
-- kalsin (geri gelince ayni liste + tamamlananlar isaretli).
--
-- TASARIM KARARLARI (plan dokumaninda detayli):
--   1. Persistlik icin YENI tablo -- user_daily_quests'i genisletmek yerine.
--      Quest tablosu metrik-hedef tipi (current_value/target_value), sirali
--      uuid[] soru-snapshot'ina yeri yok.
--   2. UNIQUE(user_id, game, plan_date) -- plan OYUN-BAZLI. questions/
--      select_random_questions/session_answers/complete_game_session hepsi
--      tek-oyun kapsamli, quiz motoru oyun basina mount ediliyor (arena/[game]).
--      Cross-game plan bu RPC'lerin varsayimini bozar.
--   3. Plan uretimi API endpoint'inde (TS) yapilir, bu tabloya YALNIZ sonuc
--      snapshot'i yazilir -- RPC/trigger yok.
--   4. RLS: self-SELECT policy (parity: user_daily_quests deseni gibi, TUM
--      yazma service-role /api/study/today endpoint'i uzerinden yapilir --
--      client dogrudan insert/update etmez).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS +
-- DROP POLICY IF EXISTS once CREATE POLICY (lint-migrations.mjs kurallari).

BEGIN;

CREATE TABLE IF NOT EXISTS public.daily_plan (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game          VARCHAR(20) NOT NULL,
  plan_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  question_ids  UUID[] NOT NULL,
  completed_ids UUID[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- UNIQUE(user_id, game, plan_date) -- ayni gun/oyun icin tek plan (idempotent
-- uretim: GET var-olan satiri bulursa yeniden uretmez).
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_plan_user_game_date
  ON public.daily_plan (user_id, game, plan_date);

ALTER TABLE public.daily_plan ENABLE ROW LEVEL SECURITY;

-- Self-SELECT policy -- user_daily_quests'teki "daily_own" (FOR ALL) deseninden
-- BILINCLI farkli: bu tablonun TUM yazma yolu service-role endpoint
-- (/api/study/today) uzerinden, client'in dogrudan INSERT/UPDATE yetkisine
-- ihtiyaci yok. Salt-okuma kendi planini gorebilsin yeterli.
DROP POLICY IF EXISTS "daily_plan_own_select" ON public.daily_plan;
CREATE POLICY "daily_plan_own_select" ON public.daily_plan
  FOR SELECT USING (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
