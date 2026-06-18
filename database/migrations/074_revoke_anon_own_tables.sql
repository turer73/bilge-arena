-- Migration 074: anon rolünün 'own-data' tablolarındaki ARTIK (leftover) grant'lerini kaldır
--
-- Kaynak: P0 güvenlik denetimi #100015 BULGU-2 (klipper Supabase-MCP doğrulaması).
-- Bu 5 tabloya TÜM uygulama erişimi server-side service-role üzerinden yapılıyor
-- (API-proxy-only; eski client `.from()` çağrıları Madde-9'da server'a taşındı —
-- bkz. profile-stats / topic-strengths / difficulty route yorumları).
--
-- DURUM: anon'da SELECT + INSERT + UPDATE + DELETE leftover grant'ler vardı.
-- RLS '_own' politikaları (auth.uid() = user_id) anon'u (auth.uid() = NULL) zaten
-- bloklıyordu → AKTIF AÇIK YOK. Bu, defense-in-depth: ileride bir RLS politikası
-- regrese olursa bu grant'ler latent risk olur. Niyet = anon'un bu tablolara hiç
-- erişimi olmaması. Idempotent (REVOKE tekrar-güvenli).
--
-- Kapsam: yalnız anon. authenticated'ın leftover INSERT/UPDATE/DELETE'i + comments/
-- comment_likes (bilinçli public) ayrı değerlendirilecek.

REVOKE ALL ON public.session_answers       FROM anon;
REVOKE ALL ON public.game_sessions          FROM anon;
REVOKE ALL ON public.user_topic_progress    FROM anon;
REVOKE ALL ON public.user_question_history   FROM anon;
REVOKE ALL ON public.challenges             FROM anon;
