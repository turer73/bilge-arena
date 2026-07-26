-- Migration 088: Re-apply the race-safe award_badges implementation.
--
-- Migration 087 was applied to production before its concurrent-conflict path
-- was corrected. Keep 087 safe for fresh databases and use this new migration
-- number so existing environments also replace the function before API rollout.

BEGIN;

CREATE OR REPLACE FUNCTION public.award_badges(
  p_user_id UUID,
  p_badge_codes TEXT[]
)
RETURNS TABLE (
  awarded_codes TEXT[],
  total_xp_earned INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_codes TEXT[] := ARRAY[]::TEXT[];
  v_total_xp INTEGER := 0;
BEGIN
  WITH requested_codes AS (
    SELECT DISTINCT requested.code
    FROM unnest(COALESCE(p_badge_codes, ARRAY[]::TEXT[])) AS requested(code)
    WHERE requested.code IS NOT NULL
  ), valid_badges AS (
    SELECT badges.code, badges.xp_reward
    FROM (VALUES
      ('first_game', 50), ('ten_games', 100), ('fifty_games', 250), ('hundred_games', 500),
      ('first_correct', 25), ('hundred_correct', 200), ('thousand_correct', 1000),
      ('streak_5', 75), ('streak_10', 200), ('streak_20', 500),
      ('xp_1000', 100), ('xp_10000', 500), ('xp_50000', 2000),
      ('daily_first', 50),
      ('login_7', 150), ('login_30', 750), ('login_100', 3000),
      ('mp_first_room', 50), ('mp_ten_rooms', 200), ('mp_first_win', 150), ('mp_five_firsts', 500)
    ) AS badges(code, xp_reward)
    INNER JOIN requested_codes ON requested_codes.code = badges.code
  ), inserted_badges AS (
    INSERT INTO public.user_achievements (user_id, achievement_id, earned_at)
    SELECT p_user_id, valid_badges.code, NOW()
    FROM valid_badges
    ON CONFLICT (user_id, achievement_id) DO NOTHING
    RETURNING achievement_id
  )
  SELECT
    COALESCE(array_agg(inserted_badges.achievement_id ORDER BY inserted_badges.achievement_id), ARRAY[]::TEXT[]),
    COALESCE(sum(valid_badges.xp_reward), 0)::INTEGER
  INTO v_new_codes, v_total_xp
  FROM inserted_badges
  INNER JOIN valid_badges ON valid_badges.code = inserted_badges.achievement_id;

  IF v_total_xp > 0 THEN
    PERFORM public.increment_xp(p_user_id, v_total_xp, 'badge_earned');
  END IF;

  RETURN QUERY SELECT v_new_codes, v_total_xp;
END;
$$;

REVOKE ALL ON FUNCTION public.award_badges(UUID, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_badges(UUID, TEXT[]) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
