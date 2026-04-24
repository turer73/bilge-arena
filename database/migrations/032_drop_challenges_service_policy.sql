-- Migration 032: challenges_service policy silinmesi (kritik RLS acigi)
--
-- Sorun (Security): Migration 020'de tanimlanan `challenges_service` policy
--   bir RLS veri sizintisi ve yazma acigi yaratiyor:
--
--     CREATE POLICY "challenges_service" ON challenges FOR ALL
--       USING (true) WITH CHECK (true);
--
--   Bu policy'nin TO clause'u yok, PostgreSQL default olarak PUBLIC (yani
--   anon + authenticated + service_role) kullanir. PostgreSQL permissive
--   policy'ler OR semantigiyle birlestirildigi icin:
--     - challenges_select_own USING (challenger_id=auth.uid() OR opponent_id=auth.uid())
--     - challenges_service    USING (true)
--   Iki policy OR'lanir, ikincisi hep TRUE donduyseli herkes (anon dahil)
--   TUM duellolari SELECT/UPDATE/DELETE/INSERT edebiliyor.
--
-- Etki:
--   - Anon user: tum duello verilerini okur (challenger_id, opponent_id, skorlar)
--   - Authenticated user: baskalarinin duellolarini silebilir/degistirebilir
--   - INSERT with_check (true): anon arbitrary challenge yaratabilir
--
-- Neden policy gereksiz:
--   service_role rolu PostgreSQL'de `bypassrls` attribute'una sahip olarak
--   yaratilir (Supabase default). RLS'i OTOMATIK bypass eder, policy'lere
--   ihtiyaci yoktur. API route'larda kullanilan `createServiceClient()` bu
--   role ile calisir. Dolayisiyla `challenges_service` policy hem amacina
--   hizmet etmiyor hem de genis bir acik yaratiyor.
--
-- Fix: Policy'yi sil. Geriye kalan challenges_select_own policy'si yeterli:
--   - Authenticated kullanicilar sadece kendi duellolarini goruyor (challenger/opponent)
--   - service_role bypassrls ile butun islemleri yapiyor (INSERT/UPDATE/DELETE)
--   - Anon: hicbir satira erisemez (challenges_select_own qual auth.uid() NULL icin false)
--
-- Uygulama etkisi:
--   Kod tarafinda degisiklik YOK. API route'lar (src/app/api/challenges/*)
--   zaten service_role client kullaniyor (svc = createServiceClient()).
--   bypassrls ile zaten RLS disinda, policy kalksa da ayni sekilde calisir.
--
-- Rollback:
--   BEGIN;
--     CREATE POLICY "challenges_service" ON challenges FOR ALL
--       USING (true) WITH CHECK (true);
--   COMMIT;
--   (Rollback yapmadan once sebebini dusun: bu policy aciktir, dondurmek
--    acidi yeniden acar.)
--
-- Dogrulama:
--   SELECT policyname, cmd, roles, qual, with_check
--   FROM pg_policies
--   WHERE tablename = 'challenges'
--   ORDER BY policyname;
--   -- Beklenen: sadece 1 satir (challenges_select_own), challenges_service gitmis


BEGIN;

DROP POLICY IF EXISTS "challenges_service" ON public.challenges;

COMMIT;
