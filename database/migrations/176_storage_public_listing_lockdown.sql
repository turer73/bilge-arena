-- Migration 176: keep public asset delivery while removing metadata listing
-- and browser-role DML policies. Public bucket object URLs do not require a
-- SELECT policy; all admin mutations use the server-owned service role.

BEGIN;

-- These two buckets predate the migration stream and were originally created
-- in the dashboard. Recreate their production constraints only when missing so
-- clean/restore environments have the same contract without mutating existing
-- bucket configuration.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', true, 1048576, ARRAY['image/png', 'image/jpeg']),
  ('homepage-assets', 'homepage-assets', true, 2097152, ARRAY['image/png', 'image/jpeg'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS avatar_public_read ON storage.objects;
DROP POLICY IF EXISTS badge_assets_public_read ON storage.objects;
DROP POLICY IF EXISTS homepage_public_read ON storage.objects;
DROP POLICY IF EXISTS video_backgrounds_public_read ON storage.objects;

DROP POLICY IF EXISTS homepage_admin_insert ON storage.objects;
DROP POLICY IF EXISTS homepage_admin_update ON storage.objects;
DROP POLICY IF EXISTS homepage_admin_delete ON storage.objects;

DO $verify$
DECLARE
  v_public_buckets integer;
  v_legacy_policies integer;
BEGIN
  SELECT count(*)
    INTO v_public_buckets
  FROM storage.buckets
  WHERE id IN ('avatars', 'badge-assets', 'homepage-assets', 'video-backgrounds')
    AND public;

  IF v_public_buckets <> 4 THEN
    RAISE EXCEPTION '176 verification: expected 4 public asset buckets, got %',
      v_public_buckets;
  END IF;

  SELECT count(*)
    INTO v_legacy_policies
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND policyname IN (
      'avatar_public_read',
      'badge_assets_public_read',
      'homepage_public_read',
      'video_backgrounds_public_read',
      'homepage_admin_insert',
      'homepage_admin_update',
      'homepage_admin_delete'
    );

  IF v_legacy_policies <> 0 THEN
    RAISE EXCEPTION '176 verification: % broad storage policies remain',
      v_legacy_policies;
  END IF;
END
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';
