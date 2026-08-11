-- Migration 111: server-verified guest activation reward
--
-- The callback recomputes correctness from server-recorded first attempts.
-- This RPC makes the final claim + XP ledger write atomic and one-time per account.

BEGIN;

CREATE TABLE IF NOT EXISTS public.activation_reward_claims (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  xp_amount integer NOT NULL CHECK (xp_amount BETWEEN 0 AND 150 AND xp_amount % 50 = 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activation_reward_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.activation_reward_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.activation_reward_claims TO service_role;

ALTER TABLE public.xp_log DROP CONSTRAINT IF EXISTS xp_log_reason_check;
ALTER TABLE public.xp_log ADD CONSTRAINT xp_log_reason_check
  CHECK (reason IN (
    'correct_answer', 'streak_bonus', 'speed_bonus', 'session_complete',
    'badge_earned', 'daily_quest', 'level_up_bonus', 'admin',
    'referral', 'challenge_win', 'daily_login', 'activation_bonus'
  ));

CREATE OR REPLACE FUNCTION public.claim_activation_reward(
  p_user_id uuid,
  p_claim_id uuid,
  p_amount integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_inserted uuid;
BEGIN
  IF p_amount < 0 OR p_amount > 150 OR p_amount % 50 <> 0 THEN
    RAISE EXCEPTION 'invalid activation reward amount' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.activation_reward_claims(id, user_id, xp_amount)
  VALUES (p_claim_id, p_user_id, p_amount)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_inserted;

  IF v_inserted IS NULL THEN
    RETURN jsonb_build_object('xpAwarded', 0, 'alreadyProcessed', true);
  END IF;

  IF p_amount > 0 THEN
    PERFORM public.increment_xp(p_user_id, p_amount, 'activation_bonus', p_claim_id);
  END IF;

  RETURN jsonb_build_object('xpAwarded', p_amount, 'alreadyProcessed', false);
END;
$func$;

REVOKE ALL ON FUNCTION public.claim_activation_reward(uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_activation_reward(uuid, uuid, integer)
  TO service_role;

COMMIT;
