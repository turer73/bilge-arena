-- Migration 051: Honeypot sentinel profile (klipper review M3)
--
-- Amac: Saldirgan public.profiles tablosunu tekrar dump'a kalkarsa anlik tespit.
--
-- Strateji:
--   profiles tablosuna 'HONEYPOT_USER_2026_05_17' adli dummy kayit ekle.
--   Bu profil:
--     - Hicbir UI'da gosterilmez (mod gosterimi farkli filtre veya rank dis)
--     - Authenticated user sorgularinda kasitli olarak filter edilir
--     - Cekilirse SQL function `audit_honeypot_access()` ile log + alert
--
-- Cikar bilgi:
--   Yeni saldiri vektoru tespit edilirse (server logu, postgres logu, vs.),
--   bu kayit muhakkak ele alinmis demek = exfiltrasyon devam ediyor.
--
-- ROW gizleme yaklasimi:
--   * leaderboard view: `WHERE NOT username LIKE '__honeypot_%__'`
--   * /api/leaderboard/landing: SQL filter zaten total_xp > 0 var, honeypot xp=0 ile dis
--   * Profil arama (admin): WHERE deleted_at IS NULL AND NOT username LIKE '__honeypot_%__'
--
-- Saldirgan acisindan goründüğünde:
--   * Tipik dump rest/v1/profiles?select=* tum satirlari ceker -> honeypot dahil
--   * Cekilince audit log'a yazilir + (varsa) Sentry/Telegram alert
--
-- NOT: Audit log icin pg_audit veya custom audit_log tablosu kullanilir.
--   Bu migration sadece HONEYPOT KAYIT olusturur + check fonksiyonu sunar.
--   Aktif alarm icin /api/cron/honeypot-check route'una bagli olabilir.

BEGIN;

-- 1) Honeypot profil kaydi
-- auth.users tablosuna 'dummy@bilgearena-honeypot.local' user ekle, sonra
-- profiles trigger ile profile olusur. Veya direkt profile insert (FK gorulebilir).
--
-- Daha temiz: profil zaten varsa skip, yoksa minimum alanlarla ekle.
-- Auth user olmadigi icin profile.id manuel UUID.

DO $$
DECLARE
  v_honeypot_id uuid := 'ffffffff-eeee-4ddd-cccc-000000000001';
  v_honeypot_username text := '__honeypot_sentinel_2026_05_17__';
BEGIN
  -- Honeypot zaten varsa skip
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_honeypot_id) THEN
    -- auth.users'ta da gereken minimum kayit (FK constraint)
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, confirmation_token, recovery_token, email_change_token_new,
      email_change, last_sign_in_at, email_change_token_current
    ) VALUES (
      v_honeypot_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      'honeypot-sentinel-2026-05-17@bilgearena.local',
      'NOPASSWORD_HONEYPOT_DO_NOT_USE',
      NOW(), NOW(), NOW(),
      '{"provider":"honeypot","providers":[]}'::jsonb,
      '{"honeypot":true}'::jsonb,
      false, '', '', '', '', NULL, ''
    ) ON CONFLICT (id) DO NOTHING;

    -- Profile kaydi (auto-create trigger devre disi olabilir, manuel ekle)
    --
    -- Codex P2 review: Migration 005'teki on_auth_user_created trigger,
    -- yukaridaki auth.users INSERT'inde public.profiles satirini auto-create
    -- eder (varsayilan username + default alanlarla). Asagidaki explicit
    -- INSERT sonrasi ON CONFLICT (id) DO NOTHING demek = honeypot username
    -- yerine trigger'in koydugu default ad kalir; check_honeypot_integrity()
    -- "Honeypot username degismis" hatasi verir. DO UPDATE ile honeypot
    -- alanlarini zorla overwrite et.
    INSERT INTO public.profiles (
      id, username, display_name, avatar_url,
      total_xp, level, level_name, current_streak, longest_streak,
      total_questions, correct_answers, total_sessions,
      created_at, last_played_at
    ) VALUES (
      v_honeypot_id,
      v_honeypot_username,
      'Honeypot Sentinel',
      NULL,
      0, 1, 'Acemi', 0, 0,
      0, 0, 0,
      NOW(), NULL
    ) ON CONFLICT (id) DO UPDATE SET
      username        = EXCLUDED.username,
      display_name    = EXCLUDED.display_name,
      avatar_url      = EXCLUDED.avatar_url,
      total_xp        = EXCLUDED.total_xp,
      level           = EXCLUDED.level,
      level_name      = EXCLUDED.level_name,
      current_streak  = EXCLUDED.current_streak,
      longest_streak  = EXCLUDED.longest_streak,
      total_questions = EXCLUDED.total_questions,
      correct_answers = EXCLUDED.correct_answers,
      total_sessions  = EXCLUDED.total_sessions,
      last_played_at  = EXCLUDED.last_played_at;
  END IF;
END $$;

-- 2) Honeypot leaderboard'larda gozukmesin
-- leaderboard_weekly_ranked view zaten leaderboard_weekly'den geliyor; honeypot
-- session_answer yapmadigi icin orada gozukmez. Yine de korumali ek filter:
--
-- Mevcut view tanimi (migration 040 sonrasi):
--   WHERE lw.week_start = date_trunc('week', NOW())::DATE
--
-- Honeypot xp=0 oldugu icin leaderboard_landing zaten gt('total_xp', 0) ile filtreliyor.
-- Ek koruma gereksiz; ama yine de admin profil listesinde filtreyi belirgin yapmak icin:

COMMENT ON COLUMN public.profiles.username IS
  'Username. Honeypot pattern: __honeypot_%__ — admin paneli ve UI listelerinde gizlenmeli.';

-- 3) Check fonksiyonu — honeypot ile temas eden trafigi tespit eder
-- Bu fonksiyon /api/cron/honeypot-check tarafindan periyodik cagrilir
-- (5 dakikada bir). Honeypot kaydi son N dakikada güncellenmis mi
-- veya SELECT'lendigi audit log'da var mi?
--
-- Gercek anlamli sonuc icin pg_audit + audit_log tablosu gerek; bu MVP:
-- Sadece honeypot existence + integrity check yapar.

-- OUT param `honeypot_last_played_at` rename: profiles.last_played_at column ile
-- ad cakismasi (PL/pgSQL 42702 ambiguous reference). Username::text cast:
-- profiles.username = varchar(32), output text bekliyor (42804). SELECT'ler
-- alias 'p' ile qualified (defensive). Hotfix migration 052 prod-side DROP+CREATE.
CREATE OR REPLACE FUNCTION public.check_honeypot_integrity()
RETURNS TABLE (
  honeypot_exists boolean,
  honeypot_username text,
  honeypot_xp integer,
  honeypot_last_played_at timestamptz,
  drift_detected boolean,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := 'ffffffff-eeee-4ddd-cccc-000000000001';
  v_p record;
BEGIN
  SELECT p.id, p.username, p.total_xp, p.last_played_at
    INTO v_p
  FROM public.profiles p
  WHERE p.id = v_id;

  IF v_p IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, NULL::integer, NULL::timestamptz, true, 'Honeypot SILINMIS — saldiri belirtisi'::text;
    RETURN;
  END IF;

  -- Drift kontrol: honeypot UI'dan oynatilmaz, total_xp 0 + last_played_at NULL olmali
  IF v_p.total_xp <> 0 OR v_p.last_played_at IS NOT NULL THEN
    RETURN QUERY SELECT
      true, v_p.username::text, v_p.total_xp, v_p.last_played_at,
      true, 'Honeypot DEGISMIS — saldirgan veya bug'::text;
    RETURN;
  END IF;

  -- Username drift
  IF v_p.username NOT LIKE '\_\_honeypot\_%\_\_' ESCAPE '\' THEN
    RETURN QUERY SELECT
      true, v_p.username::text, v_p.total_xp, v_p.last_played_at,
      true, 'Honeypot username degismis'::text;
    RETURN;
  END IF;

  -- Saglikli
  RETURN QUERY SELECT
    true, v_p.username::text, v_p.total_xp, v_p.last_played_at,
    false, 'OK'::text;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_honeypot_integrity() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_honeypot_integrity() TO service_role;

COMMIT;

-- Apply sonrasi dogrulama:
--   SELECT * FROM check_honeypot_integrity();
--   -- 1 satir: honeypot_exists=true, drift_detected=false, message='OK'
--
-- Sonraki adim (ayri PR):
--   /api/cron/honeypot-check route + Sentry/Telegram alarm + 5dk cron
