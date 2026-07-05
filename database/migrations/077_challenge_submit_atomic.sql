-- Migration 077: Duello (challenge) submit — atomik RPC
--
-- Denetim bulgusu (HIGH, disc#1261): challenges/[id]/submit route'u skoru cagri
-- basindaki snapshot'tan okuyup non-atomik read-modify-write yapiyordu. Iki oyuncu
-- ~ayni anda submit edince ikisi de karsi-skoru NULL gorup 'waiting_opponent'
-- donuyor -> duello ASLA 'completed' olmuyor (kazanan XP alamaz); guard snapshot
-- oldugu icin teorik cift-XP de mumkun.
--
-- Cozum: skor-yazma + kazanan-belirleme + XP tek transaction'da, challenge satiri
-- FOR UPDATE ile kilitli. Eszamanli ikinci submit ilkini bekler, guncel state'i
-- gorur.
--
-- Guvenlik: state-yazan DEFINER RPC -> yalniz service_role EXECUTE (bkz feedback
-- security-definer-write-rpc-service-role-only; mig 064/071 deseni). Route zaten
-- service-role client ile cagirir.

CREATE OR REPLACE FUNCTION public.submit_challenge_answer(
  p_challenge_id UUID,
  p_user_id      UUID,
  p_score        JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ch            challenges%ROWTYPE;
  v_is_challenger BOOLEAN;
  v_other_score   JSONB;
  v_winner        UUID;
  v_my_correct    INT;
  v_other_correct INT;
  v_my_time       INT;
  v_other_time    INT;
BEGIN
  -- Satir kilidi: eszamanli submit'leri serialize et (race kok-cozumu)
  SELECT * INTO v_ch FROM challenges WHERE id = p_challenge_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_ch.challenger_id <> p_user_id AND v_ch.opponent_id <> p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_participant');
  END IF;

  IF v_ch.status NOT IN ('accepted', 'pending') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_completed');
  END IF;

  v_is_challenger := (v_ch.challenger_id = p_user_id);

  -- Kendi tarafi zaten cevaplamis mi? (kilit altinda okundu -> yaris yok)
  IF v_is_challenger AND v_ch.challenger_score IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_submitted');
  END IF;
  IF NOT v_is_challenger AND v_ch.opponent_score IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_submitted');
  END IF;

  -- Skoru yaz + diger tarafin (kilit altindaki guncel) skorunu al
  IF v_is_challenger THEN
    UPDATE challenges SET challenger_score = p_score WHERE id = p_challenge_id;
    v_other_score := v_ch.opponent_score;
  ELSE
    UPDATE challenges SET opponent_score = p_score WHERE id = p_challenge_id;
    v_other_score := v_ch.challenger_score;
  END IF;

  -- Diger taraf da cevapladiysa sonuclandir
  IF v_other_score IS NOT NULL THEN
    v_my_correct    := COALESCE((p_score->>'correct')::INT, 0);
    v_other_correct := COALESCE((v_other_score->>'correct')::INT, 0);
    v_my_time       := COALESCE((p_score->>'time_sec')::INT, 0);
    v_other_time    := COALESCE((v_other_score->>'time_sec')::INT, 0);

    IF v_my_correct > v_other_correct THEN
      v_winner := p_user_id;
    ELSIF v_my_correct < v_other_correct THEN
      v_winner := CASE WHEN v_is_challenger THEN v_ch.opponent_id ELSE v_ch.challenger_id END;
    ELSE
      -- Esitlik: daha hizli olan kazanir (esit sure -> beraberlik, winner NULL)
      IF v_my_time < v_other_time THEN
        v_winner := p_user_id;
      ELSIF v_my_time > v_other_time THEN
        v_winner := CASE WHEN v_is_challenger THEN v_ch.opponent_id ELSE v_ch.challenger_id END;
      ELSE
        v_winner := NULL;
      END IF;
    END IF;

    UPDATE challenges
      SET status = 'completed', winner_id = v_winner
      WHERE id = p_challenge_id;

    -- Kazanana bonus XP (mevcut DEFINER RPC; p_reference_id UUID)
    IF v_winner IS NOT NULL THEN
      PERFORM public.increment_xp(v_winner, v_ch.xp_reward, 'challenge_win', p_challenge_id);
    END IF;

    RETURN jsonb_build_object('ok', true, 'result', 'completed', 'winnerId', v_winner);
  END IF;

  RETURN jsonb_build_object('ok', true, 'result', 'waiting_opponent');
END;
$$;

-- Yalniz service_role: state-yazan DEFINER RPC authenticated/anon'a acilmaz.
REVOKE ALL ON FUNCTION public.submit_challenge_answer(UUID, UUID, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_challenge_answer(UUID, UUID, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.submit_challenge_answer(UUID, UUID, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.submit_challenge_answer(UUID, UUID, JSONB) TO service_role;
