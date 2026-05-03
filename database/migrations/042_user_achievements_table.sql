-- Migration 042: user_achievements tablo create (rozet sistemi temelı)
--
-- Sorun (Vercel prod log 2026-05-03):
--   POST /api/badges -> 500
--   PGRST205: Could not find the table 'public.user_achievements' in the
--   schema cache
--
--   /api/badges endpoint hem GET hem POST'ta `public.user_achievements`
--   tablosuna basvuruyor (route.ts:26, 77, 100). Migration 023 soft-delete
--   bu tabloyu DELETE ediyor (varsayılarak), ama hicbir migration tabloyu
--   YARATMIYOR. Repo'da karsiligi olmayan bu tablo prod'da da yok — rozet
--   sistemi sessiz sekilde kirik (POST 500, GET 0 satir).
--
-- Cozum:
--   `CREATE TABLE IF NOT EXISTS` — Supabase'de elle olusturulmus bir varyant
--   varsa zarar vermez, yoksa olusturur. Sema kod ile uyumlu (route.ts'in
--   insert/select sutunlari):
--     - user_id          UUID FK -> profiles(id) ON DELETE CASCADE
--     - achievement_id   TEXT (badges.ts'de tanimli code, or: 'first_game')
--     - earned_at        TIMESTAMPTZ default now()
--     - UNIQUE(user_id, achievement_id) — duplicate insert engelle
--                                         (route.ts duplicate hatasini ignore)
--
-- RLS:
--   - SELECT: kullanici sadece kendi rozetlerini görur (auth.uid() = user_id)
--   - INSERT/UPDATE/DELETE: politika yok — service-role bypass eder
--                            (route.ts createServiceRoleClient kullaniyor)
--   - Anon: hicbir erisim
--
-- Index:
--   - idx_user_achievements_user_id (user_id) — sik filtre, performans
--
-- Migration 033/034 (auto_enable_rls_trigger) yeni tablolarda RLS'i otomatik
-- enable eder — burada da explicit ENABLE RLS ekleyerek belirsizlik birakmiyoruz.
--
-- Rollback (gerekirse):
--   BEGIN;
--     DROP TABLE IF EXISTS public.user_achievements;
--   COMMIT;
--
-- Dogrulama (manuel, prod sonrasi):
--   SELECT count(*) FROM public.user_achievements;     -- 0 (yeni tablo)
--   SELECT polname FROM pg_policy
--     WHERE polrelid = 'public.user_achievements'::regclass;
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--     WHERE table_schema = 'public' AND table_name = 'user_achievements';
--   -- Beklenen: anon hicbir grant yok, authenticated (RLS ile sinirli)

BEGIN;

-- ── 1. Tabloyu yarat ──
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  achievement_id  TEXT NOT NULL,
  earned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_achievements_user_badge_unique UNIQUE (user_id, achievement_id)
);

-- ── 2. Index ──
-- Cogu sorgu user_id ile filtrelenir (rozet listesi cekme)
CREATE INDEX IF NOT EXISTS idx_user_achievements_user_id
  ON public.user_achievements(user_id);

-- ── 3. RLS enable ──
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

-- ── 4. SELECT policy: kullanici sadece kendi rozetlerini gorur ──
DROP POLICY IF EXISTS user_achievements_own_select ON public.user_achievements;
CREATE POLICY user_achievements_own_select ON public.user_achievements
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT/UPDATE/DELETE policy yok — sadece service-role bypass edebilir.
-- /api/badges route'u createServiceRoleClient() kullaniyor, RLS bypass.

-- ── 5. Anon revoke (defense-in-depth, anti-scraping) ──
REVOKE ALL ON public.user_achievements FROM anon;

-- ── 6. PostgREST sema cache reload ──
-- Yeni tablonun /rest/v1/ uzerinden hemen erisilebilir olmasi icin.
NOTIFY pgrst, 'reload schema';

COMMIT;
