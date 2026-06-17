-- Migration 070: Engelle (block) + Kullanici sikayeti (user report)
--
-- Sosyal guvenlik tabani (resit-olmayan kullanici tabani icin kritik):
--   1) block_user(target) RPC — atomik engelleme. friendships.status='blocked'
--      kullanir (014'te tanimli). Engelleyen = auth.uid(); eski iliskiyi (her iki
--      yon) siler, (me, target, 'blocked') ekler. SECURITY DEFINER, anon REVOKE.
--   2) user_reports tablosu — error_reports (003) aynasi. Kullanici-kullanici
--      sikayeti. report_status tipi (003) yeniden kullanilir. RLS: reporter
--      insert/select-own + admin select/update (profiles.role='admin', bkz 004).
--   3) search_profiles — engelli/engelleyen kullanicilar aramada gizlensin
--      (CREATE OR REPLACE; signature + unaccent + honeypot filtreleri korunur).
--
-- Apply guvenligi: 014 friendships + 003 error_reports + 053 search_profiles
--   patternleri korunur. search_profiles DROP YOK (window-risk yok).

BEGIN;

-- ============================================================
-- 1) block_user RPC — atomik engelleme
-- ============================================================
CREATE OR REPLACE FUNCTION block_user(p_target UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_me UUID := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '28000';
  END IF;
  IF p_target IS NULL OR p_target = v_me THEN
    RAISE EXCEPTION 'invalid target' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_target AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'target not found' USING ERRCODE = 'P0002';
  END IF;

  -- Eski iliskiyi (her iki yon: arkadaslik/bekleyen/varsa eski engel) sil
  DELETE FROM friendships
  WHERE (user_id = v_me AND friend_id = p_target)
     OR (user_id = p_target AND friend_id = v_me);

  -- Engel kaydi ekle (me -> target)
  INSERT INTO friendships (user_id, friend_id, status)
  VALUES (v_me, p_target, 'blocked');
END;
$func$;

-- Supabase public-schema fonksiyonlari otomatik anon+authenticated EXECUTE alir;
-- anon'u kaldir, sadece authenticated kalsin (bkz feedback: default-grants-anon).
REVOKE ALL ON FUNCTION block_user(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION block_user(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION block_user(UUID) TO authenticated;

-- ============================================================
-- 2) user_reports tablosu (kullanici-kullanici sikayeti)
-- ============================================================
CREATE TYPE public.user_report_type AS ENUM (
  'harassment',     -- taciz / zorbalik
  'inappropriate',  -- uygunsuz icerik (avatar / isim)
  'impersonation',  -- taklit / sahtekarlik
  'spam',
  'other'
);

CREATE TABLE IF NOT EXISTS public.user_reports (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_type      public.user_report_type NOT NULL,
  reason           TEXT CHECK (char_length(reason) <= 1000),
  status           public.report_status DEFAULT 'pending',
  admin_note       TEXT,
  resolved_by      UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  CHECK (reporter_id <> reported_user_id)
);

CREATE INDEX idx_user_reports_reported ON public.user_reports(reported_user_id);
CREATE INDEX idx_user_reports_status ON public.user_reports(status) WHERE status = 'pending';
CREATE INDEX idx_user_reports_reporter ON public.user_reports(reporter_id);

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

-- Kullanici kendi sikayetlerini gorebilir
CREATE POLICY "user_reports_select_own" ON public.user_reports
  FOR SELECT USING (auth.uid() = reporter_id);

-- Giris yapmis kullanici kendi adina sikayet olusturabilir
CREATE POLICY "user_reports_insert" ON public.user_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- Admin tum sikayetleri gorebilir
CREATE POLICY "user_reports_select_admin" ON public.user_reports
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admin sikayet durumunu guncelleyebilir
CREATE POLICY "user_reports_update_admin" ON public.user_reports
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================
-- 3) search_profiles — engelli kullanicilari gizle (defense-in-depth)
--    053'teki tanima birebir + son AND blokugu eklendi. Signature/donustipi ayni.
-- ============================================================
CREATE OR REPLACE FUNCTION search_profiles(
  q TEXT,
  exclude_id UUID DEFAULT NULL,
  result_limit INT DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  username VARCHAR,
  display_name VARCHAR,
  avatar_url TEXT,
  total_xp INTEGER
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $func$
  SELECT p.id, p.username, p.display_name, p.avatar_url, p.total_xp
  FROM profiles p
  WHERE (
    immutable_unaccent(p.display_name) ILIKE immutable_unaccent('%' || q || '%')
    OR immutable_unaccent(p.username) ILIKE immutable_unaccent('%' || q || '%')
  )
  AND (exclude_id IS NULL OR p.id <> exclude_id)
  AND p.deleted_at IS NULL
  AND p.username NOT LIKE '\_\_honeypot\_%\_\_' ESCAPE '\'
  -- Engel iliskisi (her iki yon) varsa aramada gizle
  AND (exclude_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM friendships f
    WHERE f.status = 'blocked'
      AND ((f.user_id = exclude_id AND f.friend_id = p.id)
        OR (f.user_id = p.id AND f.friend_id = exclude_id))
  ))
  ORDER BY p.total_xp DESC NULLS LAST
  LIMIT LEAST(GREATEST(result_limit, 1), 50)
$func$;

REVOKE ALL ON FUNCTION search_profiles(TEXT, UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION search_profiles(TEXT, UUID, INT) TO authenticated;

COMMIT;
