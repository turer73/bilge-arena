-- Migration 094: persistent, append-only FSRS-6 review state.
--
-- The constants and binary ratings deliberately match ts-fsrs@5.4.1 with
-- FSRS-6 defaults, enable_fuzz=false, Again=1 and Good=3.  This is a write
-- path only: product reads remain behind a separate rollout gate.
--
-- Rollback (after the persistent-read kill switch is deployed):
--   DROP TRIGGER IF EXISTS trg_update_review_card ON public.session_answers;
--   DROP FUNCTION IF EXISTS public.trg_update_review_card();
--   DROP FUNCTION IF EXISTS public.apply_review_answer(uuid);
--   DROP FUNCTION IF EXISTS public.rebuild_review_card(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.backfill_review_cards(timestamptz, uuid, integer);
--   DROP FUNCTION IF EXISTS public.set_review_error_reason(uuid, uuid, text);
--   DROP TABLE IF EXISTS public.review_error_annotations, public.review_error_reasons,
--     public.review_logs, public.review_cards;
-- Do not delete session_answers; 094 state can always be regenerated from it.

BEGIN;

CREATE TABLE IF NOT EXISTS public.review_cards (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  due_at timestamptz NOT NULL,
  stability numeric(14,8) NOT NULL DEFAULT 0,
  difficulty numeric(14,8) NOT NULL DEFAULT 0,
  elapsed_days integer NOT NULL DEFAULT 0 CHECK (elapsed_days >= 0),
  scheduled_days integer NOT NULL DEFAULT 0 CHECK (scheduled_days >= 0),
  reps integer NOT NULL DEFAULT 0 CHECK (reps >= 0),
  lapses integer NOT NULL DEFAULT 0 CHECK (lapses >= 0),
  learning_steps integer NOT NULL DEFAULT 0 CHECK (learning_steps >= 0),
  state smallint NOT NULL DEFAULT 0 CHECK (state BETWEEN 0 AND 3),
  last_review_at timestamptz,
  last_answer_id uuid,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, question_id)
);
CREATE INDEX IF NOT EXISTS review_cards_user_due_idx ON public.review_cards (user_id, due_at);

CREATE TABLE IF NOT EXISTS public.review_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.game_sessions(id) ON DELETE CASCADE,
  answer_id uuid NOT NULL UNIQUE REFERENCES public.session_answers(id) ON DELETE RESTRICT,
  rating smallint NOT NULL CHECK (rating IN (1, 3)),
  reviewed_at timestamptz NOT NULL,
  -- Immutable raw events: card snapshots are deliberately not stored here.
  -- A late historical answer rebuilds deterministically from this event stream.
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
  ,CONSTRAINT review_logs_id_user_unique UNIQUE (id, user_id)
);
CREATE INDEX IF NOT EXISTS review_logs_card_order_idx
  ON public.review_logs (user_id, question_id, reviewed_at, answer_id);

CREATE TABLE IF NOT EXISTS public.review_error_reasons (
  code text PRIMARY KEY CHECK (code IN ('knowledge_gap','misread','calculation','time_management','careless','guess')),
  label_tr text NOT NULL, is_active boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL CHECK (sort_order >= 0)
);
INSERT INTO public.review_error_reasons (code, label_tr, sort_order) VALUES
  ('knowledge_gap','Bilgi eksiği',10), ('misread','Soruyu yanlış okuma',20),
  ('calculation','Hesaplama hatası',30), ('time_management','Süre yönetimi',40),
  ('careless','Dikkat hatası',50), ('guess','Tahmin',60)
ON CONFLICT (code) DO UPDATE SET label_tr = EXCLUDED.label_tr, sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS public.review_error_annotations (
  review_log_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason_code text NOT NULL REFERENCES public.review_error_reasons(code),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT review_error_annotations_log_owner_fkey
    FOREIGN KEY (review_log_id, user_id) REFERENCES public.review_logs(id, user_id) ON DELETE CASCADE
);

ALTER TABLE public.review_cards DROP CONSTRAINT IF EXISTS review_cards_last_answer_id_fkey;
ALTER TABLE public.review_cards ADD CONSTRAINT review_cards_last_answer_id_fkey
  FOREIGN KEY (last_answer_id) REFERENCES public.session_answers(id) ON DELETE RESTRICT;

ALTER TABLE public.review_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_error_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_error_annotations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.review_cards, public.review_logs, public.review_error_reasons, public.review_error_annotations
  FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.review_cards, public.review_logs,
  public.review_error_reasons, public.review_error_annotations FROM service_role;
GRANT SELECT ON TABLE public.review_error_reasons TO authenticated;
GRANT SELECT ON TABLE public.review_cards, public.review_logs, public.review_error_reasons,
  public.review_error_annotations TO service_role;
DROP POLICY IF EXISTS review_error_reasons_catalog_select ON public.review_error_reasons;
CREATE POLICY review_error_reasons_catalog_select ON public.review_error_reasons
  FOR SELECT TO authenticated USING (true);

-- FSRS binary transition. State: New=0, Learning=1, Review=2, Relearning=3.
-- Rounding mirrors ts-fsrs roundTo(..., 8); elapsed uses UTC calendar days.
CREATE OR REPLACE FUNCTION public.fsrs_review_transition(
  p_state smallint, p_stability numeric, p_difficulty numeric, p_last_review timestamptz,
  p_reps integer, p_lapses integer, p_learning_steps integer, p_reviewed_at timestamptz, p_rating smallint
) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $fn$
DECLARE
  w numeric[] := ARRAY[0.212,1.2931,2.3065,8.2956,6.4133,0.8334,3.0194,0.001,1.8722,0.1666,0.796,1.4835,0.0614,0.2629,1.6483,0.6014,1.8729,0.5425,0.0912,0.0658,0.1542];
  v_elapsed integer := 0; v_s numeric; v_d numeric; v_r numeric := 1; v_due timestamptz;
  v_state smallint; v_steps integer := 0; v_scheduled integer := 0; v_lapses integer := p_lapses;
  v_factor numeric := 0.98034649; v_modifier numeric := 1.00000000; v_interval integer;
  v_hard_s numeric; v_hard_interval integer;
  v_s_after_fail numeric; v_next_s_min numeric; v_sinc numeric;
BEGIN
  IF p_rating NOT IN (1,3) THEN RAISE EXCEPTION 'FSRS rating must be Again(1) or Good(3)' USING ERRCODE='22023'; END IF;
  IF p_last_review IS NOT NULL THEN
    v_elapsed := GREATEST(0, ((p_reviewed_at AT TIME ZONE 'UTC')::date - (p_last_review AT TIME ZONE 'UTC')::date));
  END IF;
  IF p_state = 0 THEN
    v_s := CASE p_rating WHEN 1 THEN w[1] ELSE w[3] END;
    v_d := round(LEAST(10::numeric, GREATEST(1::numeric, w[5] - exp((p_rating - 1) * w[6]) + 1)), 8);
  ELSE
    v_s := p_stability; v_d := p_difficulty;
    IF v_elapsed = 0 THEN
      v_sinc := power(v_s, -w[20]) * exp(w[18] * (p_rating - 3 + w[19]));
      -- ts-fsrs next_short_term_stability: Hard/Good/Easy never decrease S.
      IF p_rating >= 2 THEN v_sinc := GREATEST(v_sinc, 1); END IF;
      v_s := round(LEAST(36500::numeric, GREATEST(0.001::numeric, v_s * v_sinc)), 8);
    ELSE
      v_r := round(power(1 + v_factor * v_elapsed / v_s, -w[21]), 8);
      IF p_rating = 1 THEN
        -- FSRS-6: clamp(max(.001, min(old_s / exp(w17*w18), s_after_fail))).
        v_s_after_fail := round(
          LEAST(
            36500::numeric,
            GREATEST(
              0.001::numeric,
              w[12] * power(v_d, -w[13]) * (power(v_s + 1, w[14]) - 1) * exp((1-v_r)*w[15])
            )
          ),
          8
        );
        v_next_s_min := round(v_s / exp(w[18] * w[19]), 8);
        v_s := LEAST(GREATEST(0.001::numeric, v_next_s_min), v_s_after_fail);
      ELSE
        v_s := round(LEAST(36500::numeric, GREATEST(0.001::numeric, v_s * (1 + exp(w[9])*(11-v_d)*power(v_s,-w[10])*(exp((1-v_r)*w[11])-1)))), 8);
      END IF;
    END IF;
    v_d := round(LEAST(10::numeric, GREATEST(1::numeric, w[8] * (w[5] - exp(3*w[6]) + 1) + (1-w[8]) * (v_d + (-w[7]*(p_rating-3))*(10-v_d)/9))), 8);
  END IF;
  -- New/Learning: 1m Again; first Good advances to the 10m learning step.
  IF p_state = 0 OR p_state = 1 THEN
    IF p_rating = 1 THEN v_state := 1; v_steps := 0; v_due := p_reviewed_at + interval '1 minute';
    ELSIF p_learning_steps = 0 THEN v_state := 1; v_steps := 1; v_due := p_reviewed_at + interval '10 minutes';
    ELSE v_state := 2; v_interval := GREATEST(1, round(v_s * v_modifier)); v_scheduled := v_interval; v_due := p_reviewed_at + make_interval(days => v_interval); END IF;
  ELSIF p_state = 3 AND p_rating = 1 THEN
    v_state := 3; v_steps := 0; v_due := p_reviewed_at + interval '10 minutes';
  ELSIF p_state = 2 AND p_rating = 1 THEN
    v_state := 3; v_steps := 0; v_lapses := v_lapses + 1; v_due := p_reviewed_at + interval '10 minutes';
  ELSE
    v_state := 2; v_interval := GREATEST(1, round(v_s * v_modifier));
    -- BasicScheduler.reviewState computes Hard too, then guarantees Good is
    -- at least one day after the (min(hard, good)) interval.
    IF p_state = 2 AND p_rating = 3 THEN
      IF v_elapsed = 0 THEN
        v_hard_s := round(LEAST(36500::numeric, GREATEST(0.001::numeric, p_stability * GREATEST(power(p_stability,-w[20]) * exp(w[18] * (-1 + w[19])), 1))), 8);
      ELSE
        v_hard_s := round(LEAST(36500::numeric, GREATEST(0.001::numeric, p_stability * (1 + exp(w[9])*(11-p_difficulty)*power(p_stability,-w[10])*(exp((1-v_r)*w[11])-1)*w[16]))), 8);
      END IF;
      v_hard_interval := LEAST(GREATEST(1, round(v_hard_s * v_modifier)), v_interval);
      v_interval := GREATEST(v_interval, v_hard_interval + 1);
    END IF;
    v_scheduled := v_interval; v_due := p_reviewed_at + make_interval(days => v_interval);
  END IF;
  RETURN jsonb_build_object('due_at',v_due,'stability',v_s,'difficulty',v_d,'elapsed_days',v_elapsed,
    'scheduled_days',v_scheduled,'reps',p_reps+1,'lapses',v_lapses,'learning_steps',v_steps,'state',v_state);
END $fn$;
REVOKE ALL ON FUNCTION public.fsrs_review_transition(smallint,numeric,numeric,timestamptz,integer,integer,integer,timestamptz,smallint) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rebuild_review_card(p_user_id uuid, p_question_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE r record; c record; t jsonb;
BEGIN
  DELETE FROM public.review_cards WHERE user_id=p_user_id AND question_id=p_question_id;
  INSERT INTO public.review_cards(user_id,question_id,due_at) VALUES(p_user_id,p_question_id,'epoch') ON CONFLICT DO NOTHING;
  FOR r IN SELECT * FROM public.review_logs WHERE user_id=p_user_id AND question_id=p_question_id ORDER BY reviewed_at, answer_id LOOP
    SELECT * INTO c FROM public.review_cards WHERE user_id=p_user_id AND question_id=p_question_id FOR UPDATE;
    t := public.fsrs_review_transition(c.state,c.stability,c.difficulty,c.last_review_at,c.reps,c.lapses,c.learning_steps,r.reviewed_at,r.rating);
    UPDATE public.review_cards SET due_at=(t->>'due_at')::timestamptz, stability=(t->>'stability')::numeric, difficulty=(t->>'difficulty')::numeric,
      elapsed_days=(t->>'elapsed_days')::integer, scheduled_days=(t->>'scheduled_days')::integer, reps=(t->>'reps')::integer,
      lapses=(t->>'lapses')::integer, learning_steps=(t->>'learning_steps')::integer, state=(t->>'state')::smallint,
      last_review_at=r.reviewed_at,last_answer_id=r.answer_id,revision=revision+1,updated_at=clock_timestamp()
    WHERE user_id=p_user_id AND question_id=p_question_id;
  END LOOP;
END $fn$;
REVOKE ALL ON FUNCTION public.rebuild_review_card(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_review_answer(p_answer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $fn$
DECLARE a record; c record; t jsonb; v_log_id uuid;
BEGIN
  SELECT sa.id,sa.user_id,sa.question_id,sa.session_id,sa.is_correct,sa.is_skipped,sa.answered_at INTO a FROM public.session_answers sa WHERE sa.id=p_answer_id;
  IF NOT FOUND OR COALESCE(a.is_skipped,false) THEN RETURN; END IF;
  INSERT INTO public.review_cards(user_id,question_id,due_at) VALUES(a.user_id,a.question_id,a.answered_at) ON CONFLICT DO NOTHING;
  SELECT * INTO c FROM public.review_cards WHERE user_id=a.user_id AND question_id=a.question_id FOR UPDATE;
  INSERT INTO public.review_logs(user_id,question_id,session_id,answer_id,rating,reviewed_at)
  VALUES(a.user_id,a.question_id,a.session_id,a.id,CASE WHEN a.is_correct THEN 3 ELSE 1 END,a.answered_at)
  ON CONFLICT(answer_id) DO NOTHING RETURNING id INTO v_log_id;
  IF v_log_id IS NULL THEN RETURN; END IF;
  IF c.last_review_at IS NOT NULL AND (a.answered_at, a.id) < (c.last_review_at, COALESCE(c.last_answer_id, '00000000-0000-0000-0000-000000000000'::uuid)) THEN
    PERFORM public.rebuild_review_card(a.user_id,a.question_id); RETURN;
  END IF;
  t := public.fsrs_review_transition(c.state,c.stability,c.difficulty,c.last_review_at,c.reps,c.lapses,c.learning_steps,a.answered_at,(CASE WHEN a.is_correct THEN 3 ELSE 1 END)::smallint);
  UPDATE public.review_cards SET due_at=(t->>'due_at')::timestamptz,stability=(t->>'stability')::numeric,difficulty=(t->>'difficulty')::numeric,
    elapsed_days=(t->>'elapsed_days')::integer,scheduled_days=(t->>'scheduled_days')::integer,reps=(t->>'reps')::integer,lapses=(t->>'lapses')::integer,
    learning_steps=(t->>'learning_steps')::integer,state=(t->>'state')::smallint,last_review_at=a.answered_at,last_answer_id=a.id,revision=revision+1,updated_at=clock_timestamp()
  WHERE user_id=a.user_id AND question_id=a.question_id;
END $fn$;
REVOKE ALL ON FUNCTION public.apply_review_answer(uuid) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_update_review_card() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
BEGIN IF COALESCE(NEW.is_skipped,false) IS NOT TRUE THEN PERFORM public.apply_review_answer(NEW.id); END IF; RETURN NEW; END $fn$;
REVOKE ALL ON FUNCTION public.trg_update_review_card() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_update_review_card ON public.session_answers;
CREATE TRIGGER trg_update_review_card AFTER INSERT ON public.session_answers FOR EACH ROW WHEN (COALESCE(NEW.is_skipped,false) IS NOT TRUE) EXECUTE FUNCTION public.trg_update_review_card();

CREATE OR REPLACE FUNCTION public.backfill_review_cards(p_cursor_at timestamptz DEFAULT NULL, p_cursor_id uuid DEFAULT NULL, p_batch_size integer DEFAULT 500)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE a record; v_count integer:=0; v_last_at timestamptz:=p_cursor_at; v_last_id uuid:=p_cursor_id;
BEGIN
  IF p_batch_size IS NULL OR p_batch_size NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'batch size must be 1..1000' USING ERRCODE='22023'; END IF;
  FOR a IN SELECT sa.id,sa.answered_at FROM public.session_answers sa JOIN public.game_sessions gs ON gs.id=sa.session_id AND gs.status='completed'
    LEFT JOIN public.review_logs rl ON rl.answer_id=sa.id WHERE COALESCE(sa.is_skipped,false)=false AND rl.answer_id IS NULL
      AND (p_cursor_at IS NULL OR (sa.answered_at,sa.id)>(p_cursor_at,COALESCE(p_cursor_id,'00000000-0000-0000-0000-000000000000'::uuid)))
    ORDER BY sa.answered_at,sa.id LIMIT p_batch_size LOOP
    PERFORM public.apply_review_answer(a.id); v_count:=v_count+1; v_last_at:=a.answered_at; v_last_id:=a.id;
  END LOOP;
  RETURN jsonb_build_object('processed',v_count,'nextCursorAt',v_last_at,'nextCursorId',v_last_id);
END $fn$;

CREATE OR REPLACE FUNCTION public.set_review_error_reason(p_user_id uuid,p_review_log_id uuid,p_reason_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE v_user uuid; v_rating smallint;
BEGIN
  SELECT user_id, rating INTO v_user, v_rating FROM public.review_logs WHERE id=p_review_log_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'review log not found' USING ERRCODE='P0002'; END IF;
  IF v_user IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'review log owner mismatch' USING ERRCODE='42501'; END IF;
  IF v_rating IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'error reason requires an Again review' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.review_error_reasons WHERE code=p_reason_code AND is_active) THEN RAISE EXCEPTION 'inactive or invalid reason' USING ERRCODE='22023'; END IF;
  INSERT INTO public.review_error_annotations(review_log_id,user_id,reason_code) VALUES(p_review_log_id,v_user,p_reason_code)
  ON CONFLICT(review_log_id) DO UPDATE SET reason_code=EXCLUDED.reason_code,updated_at=clock_timestamp();
END $fn$;
REVOKE ALL ON FUNCTION public.backfill_review_cards(timestamptz,uuid,integer), public.set_review_error_reason(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_review_cards(timestamptz,uuid,integer), public.set_review_error_reason(uuid,uuid,text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
