-- Migration 040: PII anti-scraping sertlestirme (pentest sonrasi)
--
-- Sorun:
--   Pentest sirasinda Bilge Arena'nin browser'dan dogrudan Supabase'e
--   `apikey: <publishable>` ile istek attigi tespit edildi. Saldirgan
--   `GET /rest/v1/profiles?select=*` cagrisi ile asagidaki PII'yi cekebiliyor:
--     - role           (admin tespiti -> hedefli phishing)
--     - city           (sehir bilgisi)
--     - grade          (sinif seviyesi - kisisel)
--     - is_premium     (odeme bilgisi)
--     - premium_until  (odeme bilgisi)
--     - notifications  (kullanici tercihi)
--     - last_played_at (zaman deseni)
--
-- Cozum (defense-in-depth):
--   1. anon role'den hassas profil sutunlarini REVOKE (column-level grant)
--      Anonim ziyaretci sadece public oyuncu alanlarini (username, display_name,
--      avatar_url, level, xp, streak, oyun istatistikleri) gorebilir.
--   2. leaderboard_weekly_ranked view'undan `city` cikarildi.
--      Authenticated kullanicilar bile sehir bilgisini view ustunden gormez
--      (hala self-join ile kendi profilinde gorur).
--
-- NOT: Authenticated role hala tum profile sutunlarini gorebiliyor; bu Madde 9
--   (Browser->Supabase refactor) ile kapatilacak. O refactor sonrasi profile
--   sorgulari /api/profile proxy'sine tasinacak ve anon erisimi tamamen
--   kapatilabilecek.
--
-- Frontend etki kontrolu:
--   - src/components/landing/leaderboard-preview.tsx
--     SELECT: username, display_name, total_xp, current_streak  -> hepsi izinli ✓
--   - src/app/arena/siralama/siralama-client.tsx
--     leaderboard_weekly_ranked view kullanir, city kullanilmiyor (grep) ✓
--   - src/lib/supabase/sidebar-data.ts
--     leaderboard_weekly_ranked view kullanir, city kullanilmiyor ✓
--   - src/types/database.ts
--     `city` alani LeaderboardWeeklyRanked tipinden de cikarilmali (TS hata)
--
-- Rollback:
--   BEGIN;
--     GRANT SELECT ON public.profiles TO anon;
--     -- view rollback icin migration 031 sonrasi tanim:
--     DROP VIEW IF EXISTS public.leaderboard_weekly_ranked;
--     CREATE VIEW public.leaderboard_weekly_ranked
--       WITH (security_invoker = true)
--     AS SELECT lw.*, p.username, p.display_name, p.avatar_url, p.city,
--               p.level_name, p.current_streak,
--               RANK() OVER (PARTITION BY lw.week_start ORDER BY lw.xp_earned DESC)
--                 AS current_rank
--       FROM leaderboard_weekly lw
--       JOIN profiles p ON lw.user_id = p.id
--       WHERE lw.week_start = date_trunc('week', NOW())::DATE;
--   COMMIT;
--
-- Dogrulama (manuel, prod sonrasi):
--   -- 1. Anon role kontrol
--   SELECT column_name FROM information_schema.column_privileges
--   WHERE grantee = 'anon' AND table_name = 'profiles' ORDER BY column_name;
--   -- Beklenen: id, username, display_name, avatar_url, level, level_name,
--   --   total_xp, current_streak, longest_streak, total_questions,
--   --   correct_answers, total_sessions, created_at
--   -- (city, role, grade, is_premium, premium_until, notifications,
--   --  preferred_theme, last_played_at, deleted_at olmamali)
--
--   -- 2. View kontrol
--   \d+ public.leaderboard_weekly_ranked
--   -- city sutunu olmamali


BEGIN;

-- ── 1. Anon role: column-level GRANT ──
-- Once tum SELECT'i geri al, sonra sadece public sutunlara izin ver.
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (
  id,
  username,
  display_name,
  avatar_url,
  level,
  level_name,
  total_xp,
  current_streak,
  longest_streak,
  total_questions,
  correct_answers,
  total_sessions,
  created_at
) ON public.profiles TO anon;

-- ── 2. leaderboard_weekly_ranked view: city alani kaldir ──
-- View'i tamamen yeniden olustur (sutun degisikligi ALTER VIEW desteklenmiyor).
DROP VIEW IF EXISTS public.leaderboard_weekly_ranked CASCADE;

CREATE VIEW public.leaderboard_weekly_ranked
WITH (security_invoker = true)
AS
SELECT
  lw.id,
  lw.user_id,
  lw.week_start,
  lw.week_end,
  lw.xp_earned,
  lw.sessions_played,
  lw.correct_answers,
  lw.accuracy_pct,
  lw.rank,
  p.username,
  p.display_name,
  p.avatar_url,
  -- p.city,                 -- KALDIRILDI: kisisel bilgi (PII)
  p.level_name,
  p.current_streak,
  RANK() OVER (
    PARTITION BY lw.week_start
    ORDER BY lw.xp_earned DESC
  ) AS current_rank
FROM public.leaderboard_weekly lw
JOIN public.profiles p ON lw.user_id = p.id
WHERE lw.week_start = date_trunc('week', NOW())::DATE;

-- View icin grant'i geri yukle (DROP CASCADE kaldirmis olabilir)
GRANT SELECT ON public.leaderboard_weekly_ranked TO anon, authenticated;

COMMIT;
