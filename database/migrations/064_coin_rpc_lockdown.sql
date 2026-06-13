-- Migration 064: increment_coins / spend_coins anon+authenticated EXECUTE kilidi
--
-- GUVENLIK (HIGH): 055'teki bu iki RPC SECURITY DEFINER + p_user_id parametreli
-- ama auth.uid() kontrolu YOK. proacl'de anon+authenticated EXECUTE vardi:
--   * increment_coins(kendi_id/herhangi, 999999) -> SINIRSIZ coin basma
--   * spend_coins(kurban_id, hepsi)              -> baskasinin coinini sifirlama
-- Tum mesru cagiranlar zaten service-role (daily-login, quests/claim, sessions);
-- anon/authenticated grant'leri saf saldiri yuzeyi.
--
-- Cozum (059/060 frame dersi): yalnizca service_role calistirir.

BEGIN;

REVOKE EXECUTE ON FUNCTION increment_coins(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION increment_coins(uuid, integer) FROM authenticated;

REVOKE EXECUTE ON FUNCTION spend_coins(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION spend_coins(uuid, integer) FROM authenticated;

COMMIT;
