-- Migration 224: push_subscriptions yalnız sunucudan erişilir (Klipper disc #2606)
--
-- Canlı ölçüm (2026-10-18, salt okuma): relacl
--   {postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm}.
-- Tablo 013'te Supabase'in varsayılan yetkileriyle oluştu; hiçbir migration bunları
-- geri almadı. Tek koruma `push_own ((SELECT auth.uid()) = user_id)` politikasıydı.
-- RLS TRUNCATE, REFERENCES ve TRIGGER'ı kapsamaz. PostgREST TRUNCATE sunmuyor ama
-- authenticated olarak SQL çalıştıran herhangi bir SECURITY INVOKER yolu bütün
-- tabloyu boşaltabilirdi. Daha somut açık: kullanıcı kendi satırına PostgREST'ten
-- route'u atlayarak yazabiliyordu. push-endpoint.ts host listesi, 500 karakter
-- sınırı ve dakikada 5 istek sınırı yalnız /api/push'ta uygulanıyor.
--
-- Seçim: authenticated'a route'un ihtiyacını bırakmak yerine tabloyu tamamen
-- kapatmak (075 comment_likes kalıbı). upsert ON CONFLICT DO UPDATE için SELECT,
-- INSERT, UPDATE; DELETE için SELECT, DELETE gerekirdi; yani dar yetki bile
-- doğrudan yazmayı açık bırakıyordu. Artık tek yazıcı /api/push: kullanıcıyı
-- oturumdan doğrular, adresi doğrular ve service-role ile user_id'yi açıkça
-- yazar. Okuyan ve silen diğer kod (daily-streak-reminder cron'u, SECURITY
-- DEFINER soft_delete_user) zaten service-role ile çalışıyor.
--
-- push_own politikası bırakıldı: yetki ileride yanlışlıkla geri verilirse yine
-- yalnız kendi satırını açar.
--
-- Uygulama sırası: /api/push'u service-role'e taşıyan sürüm canlıdayken uygula.
-- Önceki sürüm kullanıcı JWT'siyle yazar ve bu migration'dan sonra 500 döner.
--
-- Idempotent: REVOKE/GRANT tekrar güvenli. Geri alma:
--   GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;

REVOKE ALL ON public.push_subscriptions FROM PUBLIC, anon, authenticated;

-- Canlıda service_role'ün zaten tüm yetkileri var. Bu satır, boş bir kurulumda
-- da route ve cron'un neye ihtiyaç duyduğunu açıkça kaydeder.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO service_role;
