-- Migration 031: leaderboard_weekly_ranked view SECURITY INVOKER'a cevrilmesi
--
-- Sorun (Supabase Advisor): "Security Definer View" — ERROR kategorisinde
--   tek uyari. View default olarak SECURITY DEFINER modunda tanimlanmis
--   (PostgreSQL < 15 davranisi veya explicit yaratilis). Bu, view calistirildiginda
--   RLS'lerin view sahibinin (postgres superuser) yetkileriyle degerlendirildigi
--   anlamina gelir — yani RLS policy'leri BYPASS edilir ve her kullanici tum
--   satirlari gorebilir. ERROR kategorisinde olmasinin sebebi bu: view altindaki
--   tablolara RLS koyup da view'i DEFINER birakmak RLS'i ETKISIZ hale getirir.
--
-- View tanimi (schema.sql:190):
--   CREATE VIEW leaderboard_weekly_ranked AS
--   SELECT lw.*, p.username, p.display_name, p.avatar_url, p.city,
--          p.level_name, p.current_streak,
--          RANK() OVER (PARTITION BY lw.week_start ORDER BY lw.xp_earned DESC)
--            AS current_rank
--   FROM leaderboard_weekly lw
--   JOIN profiles p ON lw.user_id = p.id
--   WHERE lw.week_start = date_trunc('week', NOW())::DATE;
--
-- INVOKER moduna cevirmenin guvenligi:
--   View iki tabloya dokunur: leaderboard_weekly ve profiles. Her ikisinin
--   SELECT RLS policy'si qual=true (herkes okur):
--     - leaderboard_weekly.lb_select_all: SELECT USING (true)
--     - profiles.profiles_select_all:     SELECT USING (true)
--   Dolayisiyla INVOKER moduna gecince kullanici (anon dahil) yine tum
--   satirlari gorur. Davranis degismez.
--
-- Fix: ALTER VIEW ... SET (security_invoker = true)
--   PostgreSQL 15+ ozelligi. View govdesini DEGISTIRMEZ, sadece ReLy
--   mode flag'ini toggle eder. Zero-impact, zero-downtime.
--
-- Kullanim yerleri (code grep):
--   - src/app/arena/siralama/siralama-client.tsx:37  (browser-side auth user)
--   - src/lib/supabase/sidebar-data.ts:40            (sidebar top 5)
--   - src/types/database.ts:466                     (TypeScript Row tipi)
--
-- Rollback:
--   BEGIN;
--     ALTER VIEW public.leaderboard_weekly_ranked SET (security_invoker = false);
--   COMMIT;
--
-- Dogrulama (manuel):
--   SELECT relname, reloptions
--   FROM pg_class
--   WHERE relname = 'leaderboard_weekly_ranked'
--     AND relnamespace = 'public'::regnamespace;
--   -- Beklenen reloptions: {security_invoker=true}
--
-- Advisor sonrasi:
--   1. Migration'i prod'da calistir
--   2. Supabase Dashboard -> Database -> Advisors -> Security -> Rerun linter
--   3. "Security Definer View" Error 1 -> 0 dusmeli (1 Error kalmiyor)


BEGIN;

ALTER VIEW public.leaderboard_weekly_ranked SET (security_invoker = true);

COMMIT;
