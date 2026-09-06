-- Migration 211 data preflight: independent, aggregate-only, SQL Editor compatible.
-- This is NOT migration-ledger, feature-flag, deployment, or production-clone proof.
-- No migration 211 helper is required or invoked. Run the complete file alone.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='3s';
SET LOCAL idle_in_transaction_session_timeout='60s';
SET LOCAL TIME ZONE 'UTC';

DO $data_check$
DECLARE v_invalid_count bigint;
BEGIN
  -- Prevent a restricted role's RLS-filtered zero from masquerading as proof.
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION '211 check requires an unrestricted database inspection role' USING ERRCODE='42501';
  END IF;
  WITH completed_programs AS (
    SELECT * FROM public.institution_study_programs WHERE status='completed'
  ), item_checks AS (
    SELECT program.id AS program_id,item.position,
      COALESCE(item.status='completed' AND item.completed_at IS NOT NULL
        AND item.target_question_count BETWEEN 1 AND 10 AND item.outcome_code IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.institution_study_program_item_executions execution
          WHERE execution.program_id=program.id AND execution.position=item.position
            AND execution.student_id=program.student_id AND execution.task_type=item.task_type
            AND execution.game=program.game AND execution.display_exam_ref=program.display_exam_ref
            AND execution.question_exam_ref IS NOT DISTINCT FROM program.question_exam_ref
            AND execution.taxonomy_version=program.taxonomy_version
            AND execution.status='completed' AND execution.expired_at IS NULL
            AND execution.completed_at=item.completed_at
            AND execution.completed_at BETWEEN execution.started_at AND execution.expires_at
            AND (
              (item.task_type='verified_questions' AND execution.diagnostic_session_id IS NULL AND EXISTS (
                SELECT 1 FROM public.verified_attempts attempt
                WHERE attempt.id=execution.verified_attempt_id AND attempt.user_id=program.student_id
                  AND attempt.game=program.game AND attempt.mode='practice' AND attempt.session_id IS NOT NULL
                  AND attempt.started_at>=execution.started_at AND attempt.completed_at=execution.completed_at
                  AND (SELECT count(DISTINCT evidence.answer_id)
                    FROM public.mastery_outcome_evidence evidence
                    JOIN public.session_answers answer ON answer.id=evidence.answer_id
                    JOIN public.curriculum_outcomes outcome ON outcome.id=evidence.outcome_id
                    WHERE evidence.attempt_id=attempt.id AND evidence.user_id=program.student_id
                      AND answer.session_id=attempt.session_id AND answer.user_id=program.student_id
                      AND NOT COALESCE(answer.is_skipped,false) AND outcome.code=item.outcome_code
                      AND outcome.game=program.game AND outcome.exam_ref=program.display_exam_ref
                      AND outcome.taxonomy_version=program.taxonomy_version)>=item.target_question_count
              )) OR (item.task_type='diagnostic' AND execution.verified_attempt_id IS NULL AND EXISTS (
                SELECT 1 FROM public.adaptive_diagnostic_sessions session
                WHERE session.id=execution.diagnostic_session_id AND session.user_id=program.student_id
                  AND session.game=program.game AND session.exam_ref=program.display_exam_ref
                  AND session.question_exam_ref IS NOT DISTINCT FROM program.question_exam_ref
                  AND session.taxonomy_version=program.taxonomy_version AND session.status='completed'
                  AND session.started_at>=execution.started_at AND session.completed_at=execution.completed_at
                  AND (SELECT count(*) FROM public.adaptive_diagnostic_answers answer
                    WHERE answer.session_id=session.id AND answer.user_id=program.student_id)>=item.target_question_count
                  AND EXISTS (SELECT 1 FROM public.adaptive_diagnostic_answers answer
                    JOIN public.curriculum_outcomes outcome ON outcome.id=answer.outcome_id
                    WHERE answer.session_id=session.id AND answer.user_id=program.student_id
                      AND outcome.code=item.outcome_code AND outcome.game=program.game
                      AND outcome.exam_ref=program.display_exam_ref
                      AND outcome.taxonomy_version=program.taxonomy_version)
              ))
            )
        ),false) AS trusted_item
    FROM completed_programs program
    LEFT JOIN public.institution_study_program_items item ON item.program_id=program.id
  ), item_totals AS (
    SELECT program_id,count(position) AS actual_item_count,bool_and(trusted_item) AS all_items_trusted
    FROM item_checks GROUP BY program_id
  )
  SELECT count(*) INTO v_invalid_count FROM completed_programs program
  JOIN item_totals totals ON totals.program_id=program.id
  WHERE program.completed_at IS NULL OR program.item_count<1
    OR totals.actual_item_count IS DISTINCT FROM program.item_count::bigint
    OR NOT totals.all_items_trusted
    OR NOT EXISTS (SELECT 1 FROM public.institution_study_program_reviews review
      WHERE review.program_id=program.id AND review.institution_id=program.institution_id
        AND review.classroom_id=program.classroom_id AND review.membership_id=program.membership_id
        AND review.student_id=program.student_id AND review.teacher_id=program.teacher_id);
  IF v_invalid_count>0 THEN
    RAISE EXCEPTION '211 independent data check failed: % invalid completed programs',v_invalid_count
      USING ERRCODE='23514';
  END IF;
END;
$data_check$;

SELECT 'institution_program_completion_211_preflight' AS check_name,
  true AS passed,current_setting('transaction_read_only')='on' AS read_only,
  (SELECT count(*) FROM public.institution_study_programs WHERE status='completed') AS completed_programs_checked,
  false AS production_readiness_proof;
ROLLBACK;
