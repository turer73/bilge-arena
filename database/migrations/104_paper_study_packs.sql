-- Migration 104: private immutable paper-study snapshots; no verified/reward/social writes.
BEGIN;
CREATE TABLE IF NOT EXISTS public.paper_study_packs(
 id uuid PRIMARY KEY DEFAULT public.gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,plan_id uuid NOT NULL REFERENCES public.daily_plan(id) ON DELETE RESTRICT,issue_request_id uuid NOT NULL UNIQUE,status text NOT NULL DEFAULT 'active' CHECK(status IN('active','submitted')),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,submitted_at timestamptz,submit_result jsonb,UNIQUE(user_id,plan_id));
CREATE TABLE IF NOT EXISTS public.paper_study_pack_items(
 pack_id uuid NOT NULL REFERENCES public.paper_study_packs(id) ON DELETE RESTRICT,position smallint NOT NULL CHECK(position BETWEEN 1 AND 15),question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE RESTRICT,game text NOT NULL,category text,topic text,difficulty smallint NOT NULL CHECK(difficulty BETWEEN 1 AND 5),content jsonb NOT NULL,correct_option integer NOT NULL CHECK(correct_option>=0),selected_option integer,is_correct boolean,PRIMARY KEY(pack_id,position),UNIQUE(pack_id,question_id),CHECK((selected_option IS NULL AND is_correct IS NULL) OR (selected_option IS NOT NULL AND is_correct IS NOT NULL)),CHECK(selected_option IS NULL OR selected_option>=0));
CREATE TABLE IF NOT EXISTS public.paper_study_pack_item_outcomes(pack_id uuid NOT NULL,position smallint NOT NULL,outcome_id uuid NOT NULL REFERENCES public.curriculum_outcomes(id) ON DELETE RESTRICT,mapping_weight numeric(8,3) NOT NULL CHECK(mapping_weight>0),PRIMARY KEY(pack_id,position,outcome_id),FOREIGN KEY(pack_id,position) REFERENCES public.paper_study_pack_items(pack_id,position) ON DELETE RESTRICT);
CREATE TABLE IF NOT EXISTS public.paper_study_pack_submission_requests(request_id uuid PRIMARY KEY,pack_id uuid NOT NULL REFERENCES public.paper_study_packs(id) ON DELETE RESTRICT,user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,payload_hash text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE TABLE IF NOT EXISTS public.paper_outcome_evidence(pack_id uuid NOT NULL REFERENCES public.paper_study_packs(id) ON DELETE RESTRICT,position smallint NOT NULL,outcome_id uuid NOT NULL,user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,is_correct boolean NOT NULL,mapping_weight numeric(8,3) NOT NULL,mastery_delta numeric(8,3) NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(pack_id,position,outcome_id));
ALTER TABLE public.paper_study_packs ENABLE ROW LEVEL SECURITY; ALTER TABLE public.paper_study_pack_items ENABLE ROW LEVEL SECURITY; ALTER TABLE public.paper_study_pack_item_outcomes ENABLE ROW LEVEL SECURITY; ALTER TABLE public.paper_study_pack_submission_requests ENABLE ROW LEVEL SECURITY; ALTER TABLE public.paper_outcome_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.paper_study_packs,public.paper_study_pack_items,public.paper_study_pack_item_outcomes,public.paper_study_pack_submission_requests,public.paper_outcome_evidence FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.issue_paper_study_pack(p_user_id uuid,p_plan_id uuid,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE p public.paper_study_packs%ROWTYPE; n integer;
BEGIN
 IF p_user_id IS NULL OR p_plan_id IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'user, plan and request required' USING ERRCODE='22023'; END IF;
 IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'paper pack owner mismatch' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('paper-issue:'||p_request_id::text,0));
 SELECT * INTO p FROM public.paper_study_packs WHERE issue_request_id=p_request_id FOR UPDATE;
 IF FOUND THEN IF p.user_id IS DISTINCT FROM p_user_id OR p.plan_id IS DISTINCT FROM p_plan_id THEN RAISE EXCEPTION 'issue request payload mismatch' USING ERRCODE='22023'; END IF; RETURN jsonb_build_object('packId',p.id,'status',p.status,'createdAt',p.created_at,'expiresAt',p.expires_at,'itemCount',(SELECT count(*) FROM public.paper_study_pack_items WHERE pack_id=p.id),'replayed',true); END IF;
 IF NOT EXISTS(SELECT 1 FROM public.daily_plan dp WHERE dp.id=p_plan_id AND dp.user_id=p_user_id AND dp.plan_date=(clock_timestamp() AT TIME ZONE 'Europe/Istanbul')::date) THEN RAISE EXCEPTION 'daily plan must be the current Istanbul owner plan' USING ERRCODE='42501'; END IF;
 SELECT count(*) INTO n FROM public.daily_plan_items WHERE plan_id=p_plan_id; IF n NOT BETWEEN 1 AND 15 THEN RAISE EXCEPTION 'plan must have 1..15 items' USING ERRCODE='22023'; END IF;
 INSERT INTO public.paper_study_packs(user_id,plan_id,issue_request_id,expires_at) VALUES(p_user_id,p_plan_id,p_request_id,clock_timestamp()+interval '7 days') RETURNING * INTO p;
 INSERT INTO public.paper_study_pack_items(pack_id,position,question_id,game,category,topic,difficulty,content,correct_option)
 SELECT p.id,dpi.position,q.id,q.game,q.category,q.topic,q.difficulty,jsonb_strip_nulls(jsonb_build_object('question',q.content->'question','options',q.content->'options','sentence',q.content->'sentence','passage',q.content->'passage','context',q.content->'context','type',q.content->'type')),(q.content->>'answer')::integer FROM public.daily_plan_items dpi JOIN public.questions q ON q.id=dpi.question_id JOIN public.daily_plan dp ON dp.id=dpi.plan_id WHERE dpi.plan_id=p_plan_id AND q.game=dp.game AND q.is_active AND jsonb_typeof(q.content->'question')='string' AND char_length(btrim(q.content->>'question')) BETWEEN 1 AND 20000 AND jsonb_typeof(q.content->'options')='array' AND jsonb_array_length(q.content->'options') BETWEEN 2 AND 10 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(q.content->'options') o WHERE jsonb_typeof(o)<>'string' OR char_length(o#>>'{}')>10000) AND (NOT q.content ? 'sentence' OR jsonb_typeof(q.content->'sentence')='string' AND char_length(q.content->>'sentence')<=20000) AND (NOT q.content ? 'context' OR jsonb_typeof(q.content->'context')='string' AND char_length(q.content->>'context')<=20000) AND (NOT q.content ? 'passage' OR jsonb_typeof(q.content->'passage')='string' AND char_length(q.content->>'passage')<=50000) AND (NOT q.content ? 'type' OR jsonb_typeof(q.content->'type')='string' AND char_length(q.content->>'type')<=80) AND (q.category IS NULL OR char_length(q.category)<=120) AND (q.topic IS NULL OR char_length(q.topic)<=200) AND (q.content->>'answer')~'^[0-9]$' AND (q.content->>'answer')::integer BETWEEN 0 AND jsonb_array_length(q.content->'options')-1 ORDER BY dpi.position;
 IF (SELECT count(*) FROM public.paper_study_pack_items WHERE pack_id=p.id)<>n THEN RAISE EXCEPTION 'plan contains inactive or invalid paper question' USING ERRCODE='22023'; END IF;
 INSERT INTO public.paper_study_pack_item_outcomes(pack_id,position,outcome_id,mapping_weight) SELECT p.id,i.position,m.outcome_id,m.weight FROM public.paper_study_pack_items i JOIN public.question_outcomes m ON m.question_id=i.question_id JOIN public.curriculum_outcomes o ON o.id=m.outcome_id AND o.is_active WHERE i.pack_id=p.id;
 RETURN jsonb_build_object('packId',p.id,'status',p.status,'createdAt',p.created_at,'expiresAt',p.expires_at,'itemCount',n,'replayed',false);
END $fn$;

CREATE OR REPLACE FUNCTION public.get_my_paper_study_pack(p_user_id uuid,p_pack_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE p public.paper_study_packs%ROWTYPE;
BEGIN
 IF p_user_id IS NULL OR p_pack_id IS NULL THEN RAISE EXCEPTION 'user and pack required' USING ERRCODE='22023'; END IF; IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'paper pack owner mismatch' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.paper_study_packs WHERE id=p_pack_id AND user_id=p_user_id; IF NOT FOUND THEN RAISE EXCEPTION 'paper pack not found' USING ERRCODE='P0002'; END IF;
 RETURN (SELECT jsonb_build_object('packId',p.id,'status',CASE WHEN p.status='active' AND p.expires_at<=clock_timestamp() THEN 'expired' ELSE p.status END,'createdAt',p.created_at,'expiresAt',p.expires_at,'submittedAt',p.submitted_at,'plan',jsonb_build_object('game',dp.game,'planDate',dp.plan_date,'examRef',dp.exam_ref),'items',jsonb_agg(jsonb_build_object('position',i.position,'question',jsonb_build_object('id',i.question_id,'game',i.game,'category',i.category,'topic',i.topic,'difficulty',i.difficulty,'content',i.content),'selectedOption',CASE WHEN p.status='submitted' THEN i.selected_option ELSE NULL END,'isCorrect',CASE WHEN p.status='submitted' THEN i.is_correct ELSE NULL END,'correctOption',CASE WHEN p.status='submitted' THEN i.correct_option ELSE NULL END) ORDER BY i.position),'summary',CASE WHEN p.status='submitted' THEN p.submit_result->'summary' ELSE NULL END,'mastery',jsonb_build_object('source','paper','weight',0.5),'reward',jsonb_build_object('xp',0,'coins',0,'socialPoints',0),'privacy',jsonb_build_object('ownerOnly',true,'privateCacheDisabled',true)) FROM public.daily_plan dp JOIN public.paper_study_pack_items i ON i.pack_id=p.id WHERE dp.id=p.plan_id GROUP BY dp.game,dp.plan_date,dp.exam_ref);
END $fn$;

CREATE OR REPLACE FUNCTION public.submit_paper_study_pack(p_user_id uuid,p_pack_id uuid,p_answers jsonb,p_request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $fn$
DECLARE p public.paper_study_packs%ROWTYPE; h text; r public.paper_study_pack_submission_requests%ROWTYPE; n integer; result jsonb;
BEGIN
 IF p_user_id IS NULL OR p_pack_id IS NULL OR p_answers IS NULL OR p_request_id IS NULL OR jsonb_typeof(p_answers)<>'array' THEN RAISE EXCEPTION 'invalid submission' USING ERRCODE='22023'; END IF; IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'paper pack owner mismatch' USING ERRCODE='42501'; END IF;
 h:=md5(p_answers::text); PERFORM pg_advisory_xact_lock(hashtextextended('paper-submit:'||p_request_id::text,0)); SELECT * INTO r FROM public.paper_study_pack_submission_requests WHERE request_id=p_request_id FOR UPDATE; IF FOUND THEN IF r.user_id IS DISTINCT FROM p_user_id OR r.pack_id IS DISTINCT FROM p_pack_id OR r.payload_hash<>h THEN RAISE EXCEPTION 'submission request payload mismatch' USING ERRCODE='22023'; END IF; RETURN r.result||jsonb_build_object('replayed',true); END IF;
 SELECT * INTO p FROM public.paper_study_packs WHERE id=p_pack_id AND user_id=p_user_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'paper pack not found' USING ERRCODE='P0002'; END IF; IF p.status='submitted' THEN RAISE EXCEPTION 'paper pack already submitted' USING ERRCODE='23505'; END IF; IF p.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'paper pack expired' USING ERRCODE='22023'; END IF;
 SELECT count(*) INTO n FROM public.paper_study_pack_items WHERE pack_id=p.id;
 IF jsonb_array_length(p_answers) NOT BETWEEN 1 AND 15 OR jsonb_array_length(p_answers)<>n
    OR EXISTS(
      SELECT 1 FROM jsonb_array_elements(p_answers) a
      WHERE CASE
        WHEN jsonb_typeof(a)<>'object' THEN true
        WHEN (SELECT count(*) FROM jsonb_object_keys(a))<>2 THEN true
        WHEN NOT(a ? 'questionId' AND a ? 'selectedOptionIndex') THEN true
        WHEN jsonb_typeof(a->'questionId') IS DISTINCT FROM 'string' THEN true
        WHEN (a->>'questionId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN true
        WHEN jsonb_typeof(a->'selectedOptionIndex') NOT IN('number','null') THEN true
        WHEN jsonb_typeof(a->'selectedOptionIndex')='number' AND (a->>'selectedOptionIndex') !~ '^[0-9]$' THEN true
        ELSE false
      END)
    OR EXISTS(SELECT a->>'questionId' FROM jsonb_array_elements(p_answers) a GROUP BY 1 HAVING count(*)<>1)
    OR EXISTS(
      SELECT 1 FROM jsonb_array_elements(p_answers) a
      LEFT JOIN public.paper_study_pack_items i
        ON i.pack_id=p.id AND lower(i.question_id::text)=lower(a->>'questionId')
      WHERE i.question_id IS NULL)
    OR EXISTS(
      SELECT 1 FROM jsonb_array_elements(p_answers) a
      JOIN public.paper_study_pack_items i
        ON i.pack_id=p.id AND lower(i.question_id::text)=lower(a->>'questionId')
      WHERE CASE
        WHEN jsonb_typeof(a->'selectedOptionIndex')='number'
          AND (a->>'selectedOptionIndex') ~ '^[0-9]$'
        THEN (a->>'selectedOptionIndex')::integer>=jsonb_array_length(i.content->'options')
        ELSE false
      END)
 THEN RAISE EXCEPTION 'answers must exactly match pack questionId and bounded selectedOptionIndex' USING ERRCODE='22023'; END IF;
 UPDATE public.paper_study_pack_items i SET selected_option=(a->>'selectedOptionIndex')::int,is_correct=CASE WHEN a->>'selectedOptionIndex' IS NULL THEN NULL ELSE (a->>'selectedOptionIndex')::int=i.correct_option END FROM jsonb_array_elements(p_answers) a WHERE i.pack_id=p.id AND lower(i.question_id::text)=lower(a->>'questionId');
 INSERT INTO public.paper_outcome_evidence(pack_id,position,outcome_id,user_id,is_correct,mapping_weight,mastery_delta) SELECT p.id,o.position,o.outcome_id,p.user_id,i.is_correct,o.mapping_weight,CASE WHEN i.is_correct THEN .5*o.mapping_weight ELSE 0 END FROM public.paper_study_pack_item_outcomes o JOIN public.paper_study_pack_items i ON i.pack_id=o.pack_id AND i.position=o.position WHERE o.pack_id=p.id AND i.selected_option IS NOT NULL;
 INSERT INTO public.user_outcome_state(user_id,outcome_id,attempts,correct_attempts,weighted_earned,weighted_possible,last_answered_at,updated_at) SELECT e.user_id,e.outcome_id,count(*)::int,count(*) FILTER(WHERE e.is_correct)::int,sum(e.mastery_delta),sum(.5*e.mapping_weight),clock_timestamp(),clock_timestamp() FROM public.paper_outcome_evidence e WHERE e.pack_id=p.id GROUP BY e.user_id,e.outcome_id ON CONFLICT(user_id,outcome_id) DO UPDATE SET attempts=public.user_outcome_state.attempts+EXCLUDED.attempts,correct_attempts=public.user_outcome_state.correct_attempts+EXCLUDED.correct_attempts,weighted_earned=public.user_outcome_state.weighted_earned+EXCLUDED.weighted_earned,weighted_possible=public.user_outcome_state.weighted_possible+EXCLUDED.weighted_possible,last_answered_at=GREATEST(COALESCE(public.user_outcome_state.last_answered_at,'-infinity'::timestamptz),COALESCE(EXCLUDED.last_answered_at,'-infinity'::timestamptz)),updated_at=clock_timestamp();
 UPDATE public.daily_plan_items SET completed_at=COALESCE(completed_at,clock_timestamp()) WHERE plan_id=p.plan_id AND question_id IN(SELECT question_id FROM public.paper_study_pack_items WHERE pack_id=p.id AND selected_option IS NOT NULL); UPDATE public.daily_plan dp SET completed_ids=COALESCE((SELECT array_agg(i.question_id ORDER BY i.position) FROM public.daily_plan_items i WHERE i.plan_id=dp.id AND i.completed_at IS NOT NULL),'{}') WHERE dp.id=p.plan_id;
 SELECT jsonb_build_object('answeredCount',count(*) FILTER(WHERE selected_option IS NOT NULL),'correctCount',count(*) FILTER(WHERE is_correct),'scorePercent',COALESCE(floor(100.0*count(*) FILTER(WHERE is_correct)/NULLIF(count(*) FILTER(WHERE selected_option IS NOT NULL),0)),0)) INTO result FROM public.paper_study_pack_items WHERE pack_id=p.id; result:=jsonb_build_object('packId',p.id,'summary',result,'replayed',false); UPDATE public.paper_study_packs SET status='submitted',submitted_at=clock_timestamp(),submit_result=result WHERE id=p.id; INSERT INTO public.paper_study_pack_submission_requests(request_id,pack_id,user_id,payload_hash,result) VALUES(p_request_id,p.id,p_user_id,h,result); RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.issue_paper_study_pack(uuid,uuid,uuid),public.get_my_paper_study_pack(uuid,uuid),public.submit_paper_study_pack(uuid,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_paper_study_pack(uuid,uuid,uuid),public.get_my_paper_study_pack(uuid,uuid),public.submit_paper_study_pack(uuid,uuid,jsonb,uuid) TO service_role;
NOTIFY pgrst,'reload schema'; COMMIT;
