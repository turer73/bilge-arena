-- Duello gonderim butunlugu (disc #2530, derin inceleme 2026-10-15 §3.4)
--
-- Sorun: submit route'u gonderilen questionId'leri challenges.question_ids ile
-- kesistirmiyordu (50'ye kadar herhangi bir soru), esitlik bozma istemcinin
-- gonderdigi timeTaken ile yapiliyordu, expires_at kontrol edilmiyordu ve
-- kazanana xp_reward gunluk tavan olmadan veriliyordu. Iki hesapla saatte
-- ~15.000 XP kazanilabiliyordu.
--
-- Bu migration:
--   1. Katilimcinin sorulari ilk actigi ani sunucuda kaydeder
--      (start_challenge_attempt). Sure bu andan olculur; istemci suresi yok sayilir.
--      Suresi dolmus duelloyu sorular verilmeden once 'expired' yapar.
--   2. submit_challenge_answer'i ayni imzayla yeniden tanimlar:
--      - 1 <= p_score.total <= duellonun soru sayisi, 0 <= correct <= total
--        (oynanabilir kumeyi route, GET ile ayni yardimciyla birebir dogrular);
--      - suresi dolmus duello reddedilir ve 'expired' olarak isaretlenir
--        (sure dolmadan baslayan oyuncuya 60 dk tamamlama payi);
--      - time_sec sunucuda hesaplanir; iki tarafin da sunucu suresi yoksa
--        esitlik beraberliktir;
--      - XP tavani: kazanan gunde (Europe/Istanbul) en cok 3 odullu duello,
--        ayni rakibe karsi en cok 1. Tavan asilirsa duello sonuclanir, XP verilmez.
--   3. Verilen XP'yi challenges.xp_awarded'a, sonuc anini completed_at'e yazar.
--
-- Deploy sirasi: route bu RPC imzasini degistirmeden cagirir; migration route'tan
-- once ya da sonra uygulanabilir. start_challenge_attempt yoksa route yalniz loglar.

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS challenger_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS opponent_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS xp_awarded integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_challenges_winner_awarded
  ON public.challenges (winner_id, completed_at)
  WHERE xp_awarded > 0;

CREATE OR REPLACE FUNCTION public.start_challenge_attempt(
  p_challenge_id uuid,
  p_user_id      uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_ch public.challenges%ROWTYPE;
  v_is_challenger boolean;
  v_started_at timestamptz;
  v_deadline timestamptz;
BEGIN
  SELECT * INTO v_ch FROM public.challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_ch.challenger_id <> p_user_id AND v_ch.opponent_id <> p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_participant');
  END IF;

  v_is_challenger := (v_ch.challenger_id = p_user_id);
  v_started_at := CASE WHEN v_is_challenger THEN v_ch.challenger_started_at ELSE v_ch.opponent_started_at END;

  -- Sonuclanmis duelloda ya da cevabini gondermis katilimcida saat kurulmaz.
  IF v_ch.status NOT IN ('pending', 'accepted')
     OR (v_is_challenger AND v_ch.challenger_score IS NOT NULL)
     OR (NOT v_is_challenger AND v_ch.opponent_score IS NOT NULL) THEN
    RETURN jsonb_build_object('ok', true, 'started', false, 'startedAt', v_started_at);
  END IF;

  -- Sure dolumu sorular verilmeden once uygulanir ve kalici yazilir. Sure
  -- dolmadan baslayan oyuncu submit ile ayni 60 dk payla devam edebilir.
  v_deadline := v_ch.expires_at;
  IF v_started_at IS NOT NULL AND v_started_at <= v_ch.expires_at THEN
    v_deadline := GREATEST(v_ch.expires_at, v_started_at + interval '60 minutes');
  END IF;
  IF clock_timestamp() > v_deadline THEN
    UPDATE public.challenges SET status = 'expired' WHERE id = p_challenge_id;
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  -- Tekrar yukleme saati sifirlamaz; ilk acilis ani korunur.
  IF v_started_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'started', false, 'startedAt', v_started_at);
  END IF;

  v_started_at := clock_timestamp();
  IF v_is_challenger THEN
    UPDATE public.challenges SET challenger_started_at = v_started_at WHERE id = p_challenge_id;
  ELSE
    UPDATE public.challenges SET opponent_started_at = v_started_at WHERE id = p_challenge_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'started', true, 'startedAt', v_started_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_challenge_answer(
  p_challenge_id UUID,
  p_user_id      UUID,
  p_score        JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_daily_win_cap  CONSTANT integer := 3;
  v_pair_win_cap   CONSTANT integer := 1;
  v_finish_grace   CONSTANT interval := interval '60 minutes';
  v_ch             public.challenges%ROWTYPE;
  v_now            timestamptz := clock_timestamp();
  v_is_challenger  boolean;
  v_started_at     timestamptz;
  v_deadline       timestamptz;
  v_question_count integer;
  v_total          integer;
  v_correct        integer;
  v_time_sec       integer;
  v_score          jsonb;
  v_other_score    jsonb;
  v_other_correct  integer;
  v_other_time     integer;
  v_winner         uuid;
  v_loser          uuid;
  v_day_start      timestamptz;
  v_daily_wins     integer;
  v_pair_wins      integer;
  v_xp_awarded     integer := 0;
BEGIN
  -- Satir kilidi: ayni duellodaki eszamanli gonderimleri sirala.
  SELECT * INTO v_ch FROM public.challenges WHERE id = p_challenge_id FOR UPDATE;
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
  IF (v_is_challenger AND v_ch.challenger_score IS NOT NULL)
     OR (NOT v_is_challenger AND v_ch.opponent_score IS NOT NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_submitted');
  END IF;

  v_started_at := CASE WHEN v_is_challenger THEN v_ch.challenger_started_at ELSE v_ch.opponent_started_at END;

  -- Sure dolumu. Sure dolmadan baslayan oyuncu oyunu bitirebilsin diye pay var.
  v_deadline := v_ch.expires_at;
  IF v_started_at IS NOT NULL AND v_started_at <= v_ch.expires_at THEN
    v_deadline := GREATEST(v_ch.expires_at, v_started_at + v_finish_grace);
  END IF;
  IF v_now > v_deadline THEN
    UPDATE public.challenges SET status = 'expired' WHERE id = p_challenge_id;
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  -- Skor sekli: oynanabilir soru kumesini (bankada bulunan ve icerigi gecerli
  -- sorular; GET ayni kumeyi sunar) route belirler ve birebir dogrular. RPC
  -- savunma olarak toplamin duellonun soru sayisini asmadigini dogrular;
  -- yabanci sorularla puan toplama (50 cevap) burada da reddedilir.
  v_question_count := COALESCE(cardinality(v_ch.question_ids), 0);
  IF jsonb_typeof(p_score -> 'total') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_score -> 'correct') IS DISTINCT FROM 'number' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_score');
  END IF;
  v_total := (p_score ->> 'total')::numeric::integer;
  v_correct := (p_score ->> 'correct')::numeric::integer;
  IF v_total < 1 OR v_total > v_question_count OR v_correct < 0 OR v_correct > v_total THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_score');
  END IF;

  -- Sure sunucuda olculur; istemcinin gonderdigi time_sec yok sayilir.
  v_time_sec := CASE
    WHEN v_started_at IS NULL THEN NULL
    ELSE GREATEST(0, floor(extract(epoch FROM v_now - v_started_at)))::integer
  END;
  v_score := jsonb_build_object(
    'correct', v_correct,
    'total', v_total,
    'time_sec', v_time_sec,
    'xp', COALESCE(p_score -> 'xp', to_jsonb(v_correct * 20))
  );

  IF v_is_challenger THEN
    UPDATE public.challenges SET challenger_score = v_score WHERE id = p_challenge_id;
    v_other_score := v_ch.opponent_score;
  ELSE
    UPDATE public.challenges SET opponent_score = v_score WHERE id = p_challenge_id;
    v_other_score := v_ch.challenger_score;
  END IF;

  IF v_other_score IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'result', 'waiting_opponent', 'score', v_score);
  END IF;

  v_other_correct := COALESCE((v_other_score ->> 'correct')::numeric::integer, 0);
  -- Eski (istemci sureli) skorlar esitlik bozmaya katilmaz.
  v_other_time := CASE
    WHEN jsonb_typeof(v_other_score -> 'time_sec') = 'number'
      AND (CASE WHEN v_is_challenger THEN v_ch.opponent_started_at ELSE v_ch.challenger_started_at END) IS NOT NULL
    THEN (v_other_score ->> 'time_sec')::numeric::integer
    ELSE NULL
  END;

  IF v_correct > v_other_correct THEN
    v_winner := p_user_id;
  ELSIF v_correct < v_other_correct THEN
    v_winner := CASE WHEN v_is_challenger THEN v_ch.opponent_id ELSE v_ch.challenger_id END;
  ELSIF v_time_sec IS NOT NULL AND v_other_time IS NOT NULL AND v_time_sec <> v_other_time THEN
    v_winner := CASE
      WHEN v_time_sec < v_other_time THEN p_user_id
      WHEN v_is_challenger THEN v_ch.opponent_id
      ELSE v_ch.challenger_id
    END;
  ELSE
    v_winner := NULL;
  END IF;

  IF v_winner IS NOT NULL AND v_ch.xp_reward > 0 THEN
    v_loser := CASE WHEN v_winner = v_ch.challenger_id THEN v_ch.opponent_id ELSE v_ch.challenger_id END;
    -- Ayni kazananin farkli duellolarda eszamanli odullerini sirala.
    PERFORM pg_advisory_xact_lock(hashtextextended('challenge_win:' || v_winner::text, 0));
    v_day_start := date_trunc('day', v_now AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul';

    SELECT count(*)::integer,
           count(*) FILTER (WHERE c.challenger_id = v_loser OR c.opponent_id = v_loser)::integer
      INTO v_daily_wins, v_pair_wins
      FROM public.challenges c
     WHERE c.winner_id = v_winner
       AND c.xp_awarded > 0
       AND c.completed_at >= v_day_start
       AND c.id <> p_challenge_id;

    IF v_daily_wins < v_daily_win_cap AND v_pair_wins < v_pair_win_cap THEN
      v_xp_awarded := v_ch.xp_reward;
      PERFORM public.increment_xp(v_winner, v_xp_awarded, 'challenge_win', p_challenge_id);
    END IF;
  END IF;

  UPDATE public.challenges
     SET status = 'completed',
         winner_id = v_winner,
         completed_at = v_now,
         xp_awarded = v_xp_awarded
   WHERE id = p_challenge_id;

  RETURN jsonb_build_object(
    'ok', true,
    'result', 'completed',
    'winnerId', v_winner,
    'xpAwarded', v_xp_awarded,
    'score', v_score
  );
END;
$$;

-- Yalniz service_role: state yazan DEFINER RPC'ler authenticated/anon'a acilmaz.
REVOKE ALL ON FUNCTION public.start_challenge_attempt(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_challenge_attempt(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.submit_challenge_answer(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_challenge_answer(uuid, uuid, jsonb) TO service_role;

DO $verify$
BEGIN
  IF has_function_privilege('authenticated', 'public.submit_challenge_answer(uuid,uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.start_challenge_attempt(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.start_challenge_attempt(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'challenge submit integrity: client roles must not execute challenge RPCs';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.submit_challenge_answer(uuid,uuid,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.start_challenge_attempt(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'challenge submit integrity: service_role must execute challenge RPCs';
  END IF;
END
$verify$;
