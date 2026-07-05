-- Migration 078: profiles UPDATE policy'sine WITH CHECK — defense-in-depth
--
-- Denetim notu (MEDIUM, defense-in-depth): profiles_update_own policy
--   FOR UPDATE USING (auth.uid() = id)   -- WITH CHECK YOK (full-schema.sql:618)
-- olarak tanimli. Coin/XP self-grant deligi su an YALNIZ mig 069'un
-- `REVOKE UPDATE ON profiles FROM authenticated, anon` satiriyla kapali (tek katman).
--
-- DURUST SINIR: Bu WITH CHECK marjinal bir ek katmandir; auth.uid()=id kontrolu
-- yalniz satir-SAHIPLIGINI korur (kullanici satiri baskasina ceviremez). Kolon
-- bazli korumasi YOKTUR — REVOKE bir gun geri alinirsa kullanici WITH CHECK'i
-- gecerek KENDI satirinin coin_balance/total_xp'sini yine degistirebilir (id
-- degismedigi icin WITH CHECK gecer). Ekonomi kolonlarinin ASIL korumasi:
--   (1) mig 069 REVOKE UPDATE (birincil),
--   (2) tum yazma service-role RPC'den gecer (increment_coins/increment_xp,
--       DEFINER + service_role-only).
-- Kolon-seviyesi guard istenirse ayri bir BEFORE UPDATE trigger gerekir (bu
-- migration'a dahil DEGIL — cascade-risk, lokal-validasyon sart).
--
-- Bu degisiklik SIFIR-RISK: service_role RLS'i tumden bypass eder (WITH CHECK
-- ona uygulanmaz); authenticated zaten UPDATE'ten REVOKE'lu. Yani hicbir mevcut
-- yazma yolunu bozmaz, yalniz REVOKE-geri-alinirsa satir-hijack'i engeller.

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
