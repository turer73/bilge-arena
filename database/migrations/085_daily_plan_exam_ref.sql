-- Migration 085: daily_plan.exam_ref -- plan KIMLIGININ parcasi (Codex P2, PR#276)
--
-- BUG (Codex P2): daily_plan yalniz (user_id, game, plan_date) ile key'liydi.
-- Ayni gun ayni oyunda kullanici sinav modunu degistirince (or. YKS kullanici
-- TYT matematik plani olusturur, sonra AYT-SAY'a gecer) idempotent lookup ilk
-- satiri donuyordu: AYT seciminde TYT snapshot'i gorunuyor + PATCH tamamlanma
-- ayni karisik satiri guncelliyordu. mig 084 sonrasi uretim exam_ref'i due/weak/new
-- kovalarina geciriyor (PR#276 review-fix) ama identity/lookup exam_ref'i haric
-- birakiyordu -- bu migration exam_ref'i kimlige dahil eder.
--
-- KARAR: exam_ref kolonu + UNIQUE(user_id, game, plan_date, exam_ref). NULL
-- exam_ref (wordquest -- level_tag modeli, exam_ref KULLANMAZ) icin de gunde tek
-- plan garantisi gerektiginden UNIQUE ... NULLS NOT DISTINCT (Postgres 15+; bu
-- proje Supabase Postgres 17). Aksi halde NULL'lar distinct sayilir ve wordquest
-- ayni gun coklu plan satiri uretebilirdi.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + DROP INDEX IF EXISTS + CREATE UNIQUE
-- INDEX IF NOT EXISTS (lint-migrations.mjs kurallari). daily_plan mig 084'te
-- olusturuldu; bu migration onun uzerine kolon+index ekler.

BEGIN;

ALTER TABLE public.daily_plan ADD COLUMN IF NOT EXISTS exam_ref VARCHAR(10);

-- Eski (exam_ref'siz) unique index kaldirilir; yerine exam_ref dahil kimlik gelir.
DROP INDEX IF EXISTS idx_daily_plan_user_game_date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_plan_user_game_date_exam
  ON public.daily_plan (user_id, game, plan_date, exam_ref) NULLS NOT DISTINCT;

NOTIFY pgrst, 'reload schema';

COMMIT;
