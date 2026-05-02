-- Migration 041: questions tablo anon read REVOKE (pentest sertlestirme)
--
-- Sorun (pentest raporu Madde D):
--   Pentest sirasinda saldirgan `apikey: <publishable>` ile browser'dan dogrudan
--   `GET /rest/v1/questions?select=*` cagirip 13K+ aktif soruyu kazima
--   yapabiliyor. CF Rate Limit (20 req/10s) yavaslatir ama ~8 saat cron
--   taramasi ile tum soru bankasi cikarilir. Bu IP fikri mulkiyet leak'i + soru
--   kazima ile kopyacasi platformlar uretebilir.
--
-- Cozum (defense-in-depth, iki vector):
--   1) Anon role'den `questions` SELECT GRANT'ini kaldir (direct REST keser)
--   2) `search_questions` RPC'sinden anon EXECUTE'i kaldir (RPC bypass keser)
--      Migration 027'de RPC SECURITY DEFINER + anon GRANT verilmis idi —
--      table REVOKE'u bypass eder, supabase.rpc('search_questions') ile yine
--      kazima yapilabilirdi.
--
--   Authenticated kullanicilar normal akista oynamaya devam eder (RLS policy
--   `is_active = TRUE` hala gecerli, `authenticated` role GRANT'leri korunuyor).
--
--   Anon kullanici ne olacak?
--   - `fetchQuizQuestions()` 0 satir doner (REVOKE'tan)
--   - `use-quiz-game.ts` zaten DEMO_QUESTIONS fallback'i devreye sokar
--     (`[Demo] 2 + 3 = ?` placeholder soru, raporda Madde H gozlemi)
--   - Bu anon kullaniciya graceful degrade: 1 demo soru goruyor, signup
--     prompt'una yonelendiriliyor (Gun 2/Gun 3 modal sistemi)
--   - Trade-off: anon onboarding biraz daha agresif sigup'a yoneltir, pentest
--     vector tamamen kapanir
--
-- NOT: Bu migration RLS policy'i degistirmiyor. Sadece anon role'un table-level
--      GRANT'ini kaldiriyor. Authenticated role icin etki yok.
--
-- Frontend etki kontrolu (grep):
--   - src/lib/supabase/questions.ts: createClient (anon-key client)
--     Anon kullanici: REVOKE -> 0 row -> DEMO fallback ✓
--     Auth kullanici: JWT cookie -> authenticated role -> GRANT var ✓
--   - src/app/api/questions/route.ts: server-side createClient (anon-key + cookies)
--     Auth kullanici: JWT cookie -> authenticated ✓
--     Anon istek: rate limit 120 req/dk + RPC search_questions cagirir,
--                 RPC SECURITY DEFINER ise hala calisir, anon REVOKE etkilemez
--                 (kontrol gerekli — eger SECURITY INVOKER ise anon 0 row)
--
-- Rollback:
--   BEGIN;
--     GRANT SELECT ON public.questions TO anon;
--     GRANT EXECUTE ON FUNCTION public.search_questions(
--       TEXT, TEXT, TEXT, INT, BOOLEAN, BOOLEAN, INT, INT
--     ) TO anon;
--   COMMIT;
--
-- Dogrulama (manuel, prod sonrasi):
--   -- Anon GRANT yok mu?
--   SELECT grantee, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_schema = 'public' AND table_name = 'questions'
--     AND grantee IN ('anon', 'authenticated');
--   -- Beklenen: authenticated SELECT (UPDATE/INSERT/DELETE), anon yok

BEGIN;

-- ── 1. Anon role'den questions SELECT GRANT'ini kaldir ──
-- Direct REST `GET /rest/v1/questions?select=*` cagrilarini engeller.
REVOKE SELECT ON public.questions FROM anon;

-- ── 2. search_questions RPC'sinden anon EXECUTE'i kaldir ──
-- Migration 027'de RPC SECURITY DEFINER + GRANT TO authenticated, anon
-- olarak tanimlandi. SECURITY DEFINER table REVOKE'unu bypass eder, anon
-- yine `supabase.rpc('search_questions', { admin_view: false })` ile sorulari
-- kazıyabilir. Bu satir RPC vector'unu da kapatir.
--
-- Authenticated korunuyor — quiz UI ve admin paneli icin gerekli.
REVOKE EXECUTE ON FUNCTION public.search_questions(
  TEXT, TEXT, TEXT, INT, BOOLEAN, BOOLEAN, INT, INT
) FROM anon;

-- Authenticated dokunulmuyor (Supabase default GRANT + 027 RPC GRANT korunuyor)

COMMIT;
