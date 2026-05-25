-- Migration 049: Authenticated SELECT REVOKE (Madde 9 final lockdown)
--
-- AMAC:
--   Authenticated role'un dogrudan REST SELECT erisimini kesmek. Tum okuma
--   /api/* proxy'leri uzerinden gecsin (server-side auth + service-role +
--   .eq(user_id) filter zinciri). "Authenticated dump" vektoru burada kapanir.
--
-- ON KOSUL (tamamlandi):
--   - Madde 9 sprint #146-150 ile browser->Supabase direkt cagrilarin tamami
--     API proxy'ye tasindi.
--   - 2026-05-25 prereq refactor turu ile son 6 server-side dosya (3 self-data
--     CRUD + 3 admin/cron) service-role'a gecti.
--   - Dogrulama komutu sifir sonuc dondurur: docs/plans/2026-05-25-mig-049-prereq-audit.md
--
-- APPLY OoNCESI SMOKE TEST:
--   docs/runbooks/2026-05-17-madde9-final-lockdown.md
--   login -> quiz -> leaderboard -> profil -> admin -> duello -> yorum
--
-- KAPSAM DISINDA (BILINCLI ATLANIYOR):
--   - questions: page.tsx landing ISR getGameCounts() cookie supabase kullaniyor;
--     anon zaten 041'de REVOKE; authenticated REVOKE landing'i kirar. Apply
--     etmek isteniyorsa page.tsx getGameCounts service-role'a gecirilmeli.
--   - user_roles, role_permissions: admin.ts checkPermission() cookie context'inde
--     calisiyor; REVOKE admin panelini kirar. Apply icin admin.ts helper'lari
--     da service-role parametresi alacak sekilde refactor edilmeli.
--   - proxy.ts middleware admin check: zaten service-role fallback'i var
--     (proxy.ts:69-89), REVOKE'tan etkilenmez.

BEGIN;

-- ─── Faz 1: Kritik PII (saldiri vektoru) ────────────────────────────────────
-- profiles: /api/profile + /api/profile/sync + /api/profile/stats +
-- /api/profile/difficulty + /api/profile/topic-strengths + /api/profile/avatar +
-- /api/daily-login + /api/quiz-limit + /api/referral + /api/admin/* uzerinden
REVOKE SELECT ON public.profiles FROM authenticated;

-- ─── Faz 2: User-spesifik veri (kazima vektorleri) ─────────────────────────
REVOKE SELECT ON public.session_answers       FROM authenticated;
REVOKE SELECT ON public.game_sessions         FROM authenticated;
REVOKE SELECT ON public.user_topic_progress   FROM authenticated;
REVOKE SELECT ON public.user_question_history FROM authenticated;

-- ─── Faz 3: Social tablolar ─────────────────────────────────────────────────
REVOKE SELECT ON public.comments      FROM authenticated;
REVOKE SELECT ON public.comment_likes FROM authenticated;

-- ─── Faz 4: Multiplayer ─────────────────────────────────────────────────────
REVOKE SELECT ON public.challenges FROM authenticated;

COMMIT;

-- ─── POST-APPLY DOGRULAMA (manuel calistir) ────────────────────────────────
-- Hangi tablolarda authenticated SELECT hala var? (yukaridakiler cikmamali)
--
-- SELECT table_name, string_agg(privilege_type, ',') AS privileges
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public' AND grantee = 'authenticated' AND privilege_type = 'SELECT'
-- GROUP BY table_name ORDER BY table_name;
