-- 060_revoke_purchase_frame_anon.sql
-- GUVENLIK (PR #167 sonrasi MCP prod-ACL dogrulamasi): 059 authenticated'i
-- revoke etti AMA purchase_frame'de `anon` rolu HALA EXECUTE'a sahipti.
--
-- KOK NEDEN: Supabase `public` semasinda
--   ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role
-- uygular. Yani fonksiyon CREATE edilince otomatik anon+authenticated+service_role
-- EXECUTE alir. 058'in `REVOKE ... FROM PUBLIC`'i bu EXPLICIT rol grant'larini
-- KALDIRMAZ; 059 da yalniz authenticated'i revoke etti -> anon atlandi.
--
-- ETKI: anon EXECUTE = giris yapmadan (sadece anon key ile)
--   supabase.rpc('purchase_frame', { p_user_id, p_frame_id, p_cost: 0 })
-- cagrilabilir. SECURITY DEFINER + RLS-bypass -> bedava cerceve / baska profili
-- hedefleme. authenticated'den daha ciddi (auth gerekmez).
--
-- FIX: purchase_frame'i kilitle -> yalniz service_role cagirabilir (API route
-- service-role client kullanir). anon + authenticated + PUBLIC revoke
-- (authenticated/PUBLIC 059'da yapildi -> idempotent tekrar, airtight).

REVOKE EXECUTE ON FUNCTION purchase_frame(uuid, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION purchase_frame(uuid, text, integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION purchase_frame(uuid, text, integer) FROM PUBLIC;

-- service_role GRANT'i (058) korunur -> route bozulmaz.
-- Beklenen son ACL: postgres (owner) + service_role.
