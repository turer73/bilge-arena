-- 059_revoke_purchase_frame_authenticated.sql
-- GUVENLIK (Codex P1 - PR #166 review): 058'deki purchase_frame SECURITY DEFINER
-- RPC'si caller-supplied p_user_id / p_frame_id / p_cost'a guveniyor (tek dahili
-- kontrol p_cost < 0). 058 bu fonksiyonu `authenticated` rolune GRANT EXECUTE
-- etmisti -> giris yapmis herhangi bir kullanici API route'unu ATLAYIP dogrudan
--   supabase.rpc('purchase_frame', { p_user_id, p_frame_id, p_cost: 0 })
-- cagirarak bedava cerceve ekleyebilir (cost=0, >=0 kontrolunu gecer) veya
-- farkli bir profil id'si hedefleyebilir. Privilege escalation.
--
-- API route (src/app/api/profile/frames/purchase/route.ts) service-role client
-- kullanir ve gercek cost'u sunucu tarafinda verir. Bu yuzden dogrudan
-- authenticated erisimini geri aliyoruz; yalniz service_role cagirabilir.

REVOKE EXECUTE ON FUNCTION purchase_frame(uuid, text, integer) FROM authenticated;
-- Defensive (058 zaten PUBLIC'i revoke etti; idempotent tekrar):
REVOKE EXECUTE ON FUNCTION purchase_frame(uuid, text, integer) FROM PUBLIC;

-- NOT: service_role GRANT'i (058) korunur -> route bozulmaz.
