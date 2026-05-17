-- Migration 047a: soft_delete + hard_delete fonksiyonlarinda authenticated REVOKE
--
-- 047 dogrulamasinda kesfedilen privilege escalation:
--   Klipper'in 2026-05-17 gece duzenlemesi soft_delete_user ve
--   hard_delete_expired_users fonksiyonlarina authenticated EXECUTE yetkisi
--   eklemis (muhtemelen 8 REVOKE script'inde son 3 fonksiyon pattern'ini
--   yanlislikla bu ikisine de uygulayarak).
--
-- Risk: Her iki fonksiyon SECURITY DEFINER + auth.uid() kontrolu YOK + UUID
--   parametresi disaridan veriliyor. Authenticated kullanici herhangi bir
--   profili silebilir veya 30 gun eski silinmis kullanicilari toplu hard delete
--   tetikleyebilir.
--
-- Bu migration yetkiyi sadece service_role'a indirir. UI tarafindaki "hesabimi
-- sil" akisi (varsa) /api/account/delete proxy + service-role client uzerinden
-- yapilmali; doğrudan supabase.rpc('soft_delete_user') çağırmamalı.
--
-- Migration 023 zaten sadece service_role GRANT veriyordu — bu fix orijinal
-- tasarima geri donus.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.soft_delete_user(uuid)         FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.hard_delete_expired_users()    FROM authenticated;

COMMIT;
