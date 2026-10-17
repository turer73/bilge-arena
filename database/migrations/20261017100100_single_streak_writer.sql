-- Seriyi tek yazici Istanbul gunune gore yazar; longest_streak buyur
-- (derin inceleme 2026-10-15 §4.2, §9 aksiyon 9)
--
-- Sorun. Seri iki mekanizmayla ve iki farkli gun siniriyla guncelleniyordu:
--   * /api/daily-login profili oku-degistir-yaz ile guncelliyordu: Istanbul
--     gunune gore current_streak ve last_played_at=simdi. longest_streak'e hic
--     dokunmuyordu; XP'yi de total_xp'ye dogrudan ekliyordu (seviye guncellenmez).
--   * Oturum tetikleyicisi update_streak (007) CURRENT_DATE (veritabani = UTC)
--     ile calisiyordu. Gunluk giris once last_played_at'i bugune cektigi icin
--     tetikleyici cogu zaman "ayni gun" dalina dusuyor, longest_streak'i
--     buyuten "dun" dali neredeyse hic calismiyordu.
-- Sonuc: longest_streak fiilen buyumuyor, streak_5/10/20 rozetleri (775 XP)
-- kazanilamiyor, profilde "en uzun seri" mevcut seriden kucuk gorunebiliyordu.
-- Gece yarisi ile 03:00 (Istanbul) arasinda iki gun siniri ayristigi icin seri
-- ayni gunde iki kez artabiliyordu.
--
-- Cozum.
--   * update_streak Istanbul gununu kullanir ve her dalda
--     longest_streak = GREATEST(longest_streak, current_streak) yazar.
--   * claim_daily_login(p_user_id): gunluk giris odulunun tek yolu. Profil
--     satirini kilitler; odul gunde bir kez (bugunun 'daily_login' xp_log
--     satiri varsa odenmistir), seri update_streak ile yazilir, XP increment_xp
--     (seviye + xp_log), altin increment_coins ile odenir. Ayni gun once oturum
--     oynamak artik giris odulunu yakmaz.
--   * Mevcut profillerde longest_streak < current_streak olanlar duzeltilir.
--
-- Uygulama sirasi: /api/daily-login bu RPC'yi cagirir. Migration route'tan
-- ONCE uygulanmali; RPC yoksa route 503 doner (giris odulu o sure verilmez).
--
-- Geri alma: 007'deki update_streak tanimi (+030 search_path) ve bu
-- dosyadaki claim_daily_login icin DROP FUNCTION.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_streak(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  v_today     date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  v_last      timestamptz;
  v_last_day  date;
BEGIN
  -- NO KEY UPDATE: oturum tamamlamasi icinde cagrilir; eszamanli bir oturumun
  -- game_sessions INSERT'i bu satirda FK KEY SHARE tutar ve FOR UPDATE onunla
  -- kilitlenmeye (deadlock) girer.
  SELECT last_played_at INTO v_last
    FROM public.profiles
    WHERE id = p_user_id
    FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  v_last_day := (v_last AT TIME ZONE 'Europe/Istanbul')::date;

  IF v_last IS NULL OR v_last_day < v_today - 1 THEN
    UPDATE public.profiles
      SET current_streak = 1,
          longest_streak = GREATEST(COALESCE(longest_streak, 0), 1),
          last_played_at = now()
      WHERE id = p_user_id;
  ELSIF v_last_day = v_today - 1 THEN
    UPDATE public.profiles
      SET current_streak = COALESCE(current_streak, 0) + 1,
          longest_streak = GREATEST(COALESCE(longest_streak, 0), COALESCE(current_streak, 0) + 1),
          last_played_at = now()
      WHERE id = p_user_id;
  ELSE
    -- Ayni Istanbul gunu: seri degismez. longest_streak yine de en az mevcut
    -- seri kadar olur (eski cift-yazici donemi kayitlari bu yolla da duzelir).
    UPDATE public.profiles
      SET longest_streak = GREATEST(COALESCE(longest_streak, 0), COALESCE(current_streak, 0)),
          last_played_at = now()
      WHERE id = p_user_id;
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.update_streak(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_daily_login(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  -- Odul olcegi /api/daily-login ile ayni: seri x 10 XP (en cok 70),
  -- seri x 2 altin (en cok 20).
  c_xp_per_day    CONSTANT integer := 10;
  c_max_xp        CONSTANT integer := 70;
  c_coin_per_day  CONSTANT integer := 2;
  c_max_coins     CONSTANT integer := 20;
  v_day_start     timestamptz := date_trunc('day', now() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul';
  v_today         date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  v_previous      integer;
  v_last          timestamptz;
  v_streak        integer;
  v_xp            integer;
  v_coins         integer;
  v_reset         boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required' USING ERRCODE = '22023';
  END IF;

  -- Kilit: ayni kullanicinin eszamanli girisleri (ve oturum tamamlamalari)
  -- siralanir. NO KEY UPDATE, oturum tamamlamasindaki kilitle ayni seviye.
  SELECT COALESCE(current_streak, 0), last_played_at
    INTO v_previous, v_last
    FROM public.profiles
    WHERE id = p_user_id
    FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.xp_log
    WHERE user_id = p_user_id
      AND reason = 'daily_login'
      AND created_at >= v_day_start
  ) THEN
    RETURN jsonb_build_object(
      'status', 'already_claimed', 'streak', v_previous, 'xpAwarded', 0, 'coinsAwarded', 0
    );
  END IF;

  v_reset := v_previous > 0
    AND (v_last IS NULL OR (v_last AT TIME ZONE 'Europe/Istanbul')::date < v_today - 1);

  PERFORM public.update_streak(p_user_id);
  SELECT COALESCE(current_streak, 0) INTO v_streak FROM public.profiles WHERE id = p_user_id;
  v_streak := GREATEST(v_streak, 1);

  v_xp := LEAST(v_streak * c_xp_per_day, c_max_xp);
  v_coins := LEAST(v_streak * c_coin_per_day, c_max_coins);
  PERFORM public.increment_xp(p_user_id, v_xp, 'daily_login', NULL);
  PERFORM public.increment_coins(p_user_id, v_coins);

  RETURN jsonb_build_object(
    'status', CASE WHEN v_reset THEN 'streak_reset' ELSE 'claimed' END,
    'streak', v_streak,
    'xpAwarded', v_xp,
    'coinsAwarded', v_coins
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.claim_daily_login(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_login(uuid) TO service_role;

-- Cift-yazici doneminde kalan tutarsizlik: en uzun seri mevcut seriden kucuk.
UPDATE public.profiles
  SET longest_streak = current_streak
  WHERE current_streak IS NOT NULL
    AND current_streak > COALESCE(longest_streak, 0);

DO $verify$
BEGIN
  IF has_function_privilege('authenticated', 'public.claim_daily_login(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.claim_daily_login(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.update_streak(uuid)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.update_streak(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'streak: client roles must not execute streak writers directly';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.claim_daily_login(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'streak: service_role must execute claim_daily_login';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE current_streak > COALESCE(longest_streak, 0)) THEN
    RAISE EXCEPTION 'streak: longest_streak backfill incomplete';
  END IF;
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
