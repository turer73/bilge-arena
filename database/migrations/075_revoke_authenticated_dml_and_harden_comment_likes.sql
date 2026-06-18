-- Migration 075: authenticated 'own-data' leftover DML revoke + comment_likes public-enumeration kapatma
--
-- Devam: mig074 (anon own-tables) — orada "authenticated leftover + comments/comment_likes
-- ayrı değerlendirilecek" notu vardı; bu migration onu kapatır.
-- Kaynak: P0 güvenlik denetimi #100015 (BULGU-2 genişletme + comment_likes USING(true)).
--
-- DOĞRULAMA (verify-before-act, surer 2026-06-18):
--   * 5 own-tabloya TÜM yazma server-side service-role (api/sessions, api/challenges/*).
--     authenticated'da SELECT yok; sadece INSERT/UPDATE/DELETE/TRUNCATE leftover'ı var.
--     Client (*-client.tsx / hooks) bu tablolara hiç .from() yapmıyor — eski çağrılar
--     Madde-9'da server'a taşındı (profile-stats / adaptive-difficulty yorumları).
--     → REVOKE güvenli, geri-alınabilir (re-GRANT).
--   * comment_likes: read (api/comments) + write (api/comments/[id]/like upsert+delete)
--     tamamen service-role (admin). anon'da SELECT grant + RLS USING(true) → tüm like
--     grafiği (kim-neyi-beğendi) + silinmiş-yorum like'ları PostgREST'ten anon'a
--     dökülebiliyordu. comments_select ise is_deleted=false ile filtreli; comment_likes değildi.
--
-- Idempotent: REVOKE tekrar-güvenli; policy DROP IF EXISTS + CREATE.

-- === Bölüm 1: authenticated own-data tabloları (leftover INSERT/UPDATE/DELETE/TRUNCATE) ===
REVOKE ALL ON public.session_answers         FROM authenticated;
REVOKE ALL ON public.game_sessions           FROM authenticated;
REVOKE ALL ON public.user_topic_progress     FROM authenticated;
REVOKE ALL ON public.user_question_history    FROM authenticated;
REVOKE ALL ON public.challenges              FROM authenticated;

-- === Bölüm 2: comment_likes — public enumeration kapat ===
-- Tüm erişim service-role; anon/authenticated grant + USING(true) kullanılmıyor ama
-- açık saldırı yüzeyiydi. Grant'leri kaldır + SELECT policy'sini own-row'a daralt
-- (ileride grant geri verilirse latent landmine olmasın). service_role RLS'i bypass eder.
REVOKE ALL ON public.comment_likes FROM anon, authenticated;

DROP POLICY IF EXISTS "comment_likes_select" ON public.comment_likes;
CREATE POLICY "comment_likes_select" ON public.comment_likes
  FOR SELECT USING ((SELECT auth.uid()) = user_id);
