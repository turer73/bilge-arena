import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const migration = new URL('../migrations/201_institution_program_execution_integrity.sql', import.meta.url)

describe('institution program execution integrity migration', () => {
  it('keeps completion server-owned, replay-safe, and traceable', async () => {
    const sql = await readFile(migration, 'utf8')
    expect(sql).toContain("SET LOCAL TIME ZONE 'UTC'")
    expect(sql).toContain("SET LOCAL DateStyle TO 'ISO, YMD'")
    expect(sql).toContain('institution_study_program_item_executions')
    expect(sql).toMatch(/LOCK TABLE[\s\S]*public\.institution_study_programs,[\s\S]*public\.institution_study_program_items[\s\S]*IN SHARE ROW EXCLUSIVE MODE/)
    expect(sql).toContain('request_id uuid NOT NULL UNIQUE')
    expect(sql).toContain("pg_catalog.hashtextextended('institution-program-start:'||p_request_id::text,201)")
    expect(sql.match(/hashtextextended\('institution-program-execution-integrity-v201',201\)/g)).toHaveLength(4)
    expect(sql).toContain('LOCK TABLE public.verified_attempts,public.adaptive_diagnostic_sessions')
    expect(sql.indexOf('LOCK TABLE public.verified_attempts,public.adaptive_diagnostic_sessions')).toBeLessThan(
      sql.indexOf("hashtextextended('institution-program-execution-integrity-v201',201)"),
    )
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('institution_program_item_reconciliations')
    expect(sql).toContain("origin text NOT NULL CHECK (origin='system_migration')")
    expect(sql).toContain("migration_id text NOT NULL CHECK (migration_id='201')")
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS institution_program_item_reconciliations_reason_check')
    expect(sql).toContain('ADD CONSTRAINT institution_program_item_reconciliations_reason_check CHECK')
    expect(sql).toContain("'operator_approved_legacy_target_to_session_capacity'")
    expect(sql).toContain("'duplicate_full_scope_diagnostic_to_verified_baseline'")
    expect(sql).toContain('original_snapshot jsonb NOT NULL')
    expect(sql).toContain('reconciled_snapshot jsonb NOT NULL')
    expect(sql).toContain('institution_program_reconciliation_immutable')
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON public.institution_program_item_reconciliations')
    expect(sql).toContain('WITH approved(program_ref_sha256,original_state_sha256) AS (VALUES')
    expect(sql).toContain('program.id,program.program_ref,program.institution_id,program.classroom_id')
    expect(sql).toContain('program.created_at,program.reviewed_at,program.published_at,program.completed_at')
    expect(sql).toContain('item.duration_minutes,item.target_question_count,item.status,item.completed_at')
    expect(sql).toContain("program.model_version='institution-program-v1'")
    expect(sql).toContain("item.reason_code='weak_outcome' AND item.duration_minutes=25")
    expect(sql).toContain('AND item.target_question_count=15')
    expect(sql).toContain("RAISE EXCEPTION 'operator-approved target reconciliation has an existing execution'")
    expect(sql).toContain("'questionExamRef',v_candidate.question_exam_ref")
    expect(sql).toContain("'scopePolicyVersion',v_candidate.scope_policy_version")
    expect(sql).toContain("'originalStateSha256',v_candidate.original_state_sha256")
    expect(sql).toContain("WHERE program.status='published' AND item.status='pending' AND item.task_type='diagnostic'")
    expect(sql).toContain('WHERE diagnostic_rank>1')
    expect(sql).toContain("SET task_type='verified_questions',title=v_new_title,reason_code='current_target'")
    expect(sql).toContain("RAISE EXCEPTION 'duplicate diagnostic reconciliation outcome scope is ambiguous'")
    expect(sql).toContain("RAISE EXCEPTION 'published program still has duplicate full-scope diagnostics'")
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.get_institution_student_diagnostic_sources(uuid,uuid,text,text,text,timestamptz) TO authenticated')
    expect(sql).toContain("'institution_provisioned','institution_status_changed','staff_added','staff_removed'")
    expect(sql).toContain("'study_program_item_started','study_program_item_completed'")
    expect(sql).toContain('complete_institution_program_item_from_verified_attempt')
    expect(sql).toContain('complete_institution_program_item_from_diagnostic')
    expect(sql).toContain("NEW.mode<>'practice'")
    expect(sql).toContain("task_type text NOT NULL CHECK (task_type IN ('verified_questions','diagnostic'))")
    expect(sql).toContain("execution.task_type='verified_questions'")
    expect(sql).toContain("item.task_type IN ('verified_questions','diagnostic')")
    expect(sql).toContain('v_item.target_question_count NOT BETWEEN 1 AND 10')
    expect(sql).toContain('item.target_question_count BETWEEN 1 AND 10')
    expect(sql).toContain("RAISE EXCEPTION 'program item exceeds the verifiable session capacity'")
    expect(sql).not.toContain("execution.task_type IN ('verified_questions','fsrs_review')")
    expect(sql).toContain("NEW.status<>'completed'")
    expect(sql).toContain('institution_program_student_one_open_execution_idx')
    expect(sql).toContain('expires_at timestamptz NOT NULL')
    expect(sql).toContain("status='expired'")
    expect(sql).toContain('NEW.completed_at<=execution.expires_at')
    expect(sql).toContain('NOT COALESCE(answer.is_skipped,false)')
    expect(sql).toContain('count(DISTINCT evidence.answer_id)')
    expect(sql).toContain(')>=item.target_question_count')
    expect(sql).toContain("p_task_type NOT IN ('verified_questions','diagnostic')")
    expect(sql).toContain('OR p_outcome_code IS NULL')
    expect(sql).toContain("v_execution.status='started' AND v_execution.expires_at<=clock_timestamp()")
    const verifiedCompletion = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.complete_institution_program_item_from_verified_attempt'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.complete_institution_program_item_from_diagnostic'),
    )
    const diagnosticCompletion = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.complete_institution_program_item_from_diagnostic'),
      sql.indexOf('DROP TRIGGER IF EXISTS institution_program_verified_attempt_completion'),
    )
    for (const completion of [verifiedCompletion, diagnosticCompletion]) {
      expect(completion).toContain('membership.id=program.membership_id')
      expect(completion).toContain("membership.student_id=NEW.user_id AND membership.status='active'")
      expect(completion).toContain("classroom.id=program.classroom_id AND classroom.status='active'")
      expect(completion).toContain('institution.id=program.institution_id AND institution.id=classroom.institution_id')
      expect(completion).toContain('public.institution_pilot_is_operational(institution.id)')
      expect(completion).toContain('profile.id=NEW.user_id AND profile.deleted_at IS NULL')
      expect(completion).toContain('program.student_id=NEW.user_id')
      expect(completion).toContain('item.outcome_code IS NOT NULL')
      expect(completion).toContain('NOT public.teacher_classroom_is_blocked(classroom.teacher_id,NEW.user_id)')
      expect(completion).toContain('NEW.started_at>=execution.started_at')
    }
    expect(verifiedCompletion).toContain('outcome.game=execution.game AND outcome.exam_ref=execution.display_exam_ref')
    expect(sql).toContain('zzz_institution_program_verified_attempt_completion')
    expect(sql.indexOf('CREATE TRIGGER zzz_institution_program_verified_attempt_completion')).toBeGreaterThan(
      sql.indexOf('trg_materialize_verified_attempt_mastery'),
    )
    const start = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.start_my_institution_study_program_item'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.complete_institution_program_item_from_verified_attempt'),
    )
    expect(start).toContain('profile.id=p_user_id AND profile.deleted_at IS NULL')
    expect(start).toContain("RAISE EXCEPTION 'active institution program item access not found'")
    const getMy = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.get_my_institution_study_programs'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.get_institution_student_program_history_v2'),
    )
    expect(getMy).toContain('profile.id=p_user_id AND profile.deleted_at IS NULL')
    expect(sql).toContain("migration 201 postcheck failed: private execution tables need RLS")
    expect(sql).toContain("migration 201 postcheck failed: private execution table grant leaked")
    expect(sql).toContain("migration 201 postcheck failed: student program RPC ACL mismatch")
    expect(sql).toContain("migration 201 postcheck failed: diagnostic source RPC ACL mismatch")
    expect(sql).toContain("migration 201 postcheck failed: server-only program/report RPC ACL mismatch")
    expect(sql).toContain("migration 201 postcheck failed: completion/reconciliation trigger mismatch")
    expect(sql).toContain("migration 201 postcheck failed: duplicate published diagnostics remain")
  })

  it('keeps drafts editable but makes every published item launchable below the RPC layer', async () => {
    const sql = await readFile(migration, 'utf8')
    const contract = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.assert_institution_program_startable'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.institution_program_execution_immutable_fields'),
    )
    expect(contract).toContain("v_program.status<>'published'")
    expect(contract).toContain("item.task_type NOT IN ('verified_questions','diagnostic')")
    expect(contract).toContain('item.target_question_count NOT BETWEEN 1 AND 10')
    expect(contract).toContain('item.outcome_code IS NULL')
    expect(contract).toContain('same_code.code=item.outcome_code')
    expect(contract).toContain('same_category.category=target.category')
    expect(contract).toContain("public.institution_scope_capability_snapshot(")
    expect(contract).toContain("v_program.game,v_program.display_exam_ref,'program'")
    expect(contract).toContain("v_current_scope->>'taxonomyVersion' IS DISTINCT FROM v_program.taxonomy_version")
    expect(contract).toContain("v_current_scope->>'scopePolicyVersion' IS DISTINCT FROM v_program.scope_policy_version")
    expect(contract).toContain("(v_current_scope->>'diagnosticEnabled')::boolean")
    expect(contract).toContain('v_diagnostic_count>1')
    expect(contract).toContain('CREATE CONSTRAINT TRIGGER institution_program_startable_contract')
    expect(contract).toContain('CREATE CONSTRAINT TRIGGER institution_program_item_startable_contract')
    expect(contract.match(/DEFERRABLE INITIALLY DEFERRED/g)).toHaveLength(2)
    expect(sql).toContain('public.assert_institution_program_startable(program.id)')
    const start = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.start_my_institution_study_program_item'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.complete_institution_program_item_from_verified_attempt'),
    )
    expect(start.match(/PERFORM public\.assert_institution_program_startable\(v_program\.id\)/g)).toHaveLength(2)
  })

  it('uses only completed program items for a descriptive review and exposes diagnostic sources separately', async () => {
    const sql = await readFile(migration, 'utf8')
    const review = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.institution_study_program_review_evidence'))
    expect(review).toContain("item.status='completed'")
    expect(review).toContain('JOIN public.institution_study_program_item_executions execution')
    expect(review).toContain("execution.status='completed'")
    expect(review).toContain("'causalClaim',false")
    expect(review).toContain('membership.accepted_at INTO v_membership_accepted_at')
    expect(review).toContain("JOIN public.profiles profile ON profile.id=program.student_id AND profile.deleted_at IS NULL")
    expect(review).toMatch(/v_baseline_start:=greatest\([\s\S]*v_membership_accepted_at/)
    expect(review).toMatch(/v_baseline_end:=greatest\([\s\S]*v_membership_accepted_at/)
    expect(review).toContain('v_current_start:=v_baseline_end')
    expect(review).toContain("RAISE EXCEPTION 'program review has no post-acceptance evidence window'")
    const preview = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.preview_institution_study_program_review'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.review_institution_study_program'),
    )
    const reviewWrite = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.review_institution_study_program'),
      sql.indexOf('REVOKE ALL ON FUNCTION public.institution_program_reconciliation_immutable'),
    )
    for (const lifecycleGate of [preview, reviewWrite]) {
      expect(lifecycleGate).toContain("membership.student_id=program.student_id AND membership.status='active'")
      expect(lifecycleGate).toContain("classroom.status='active'")
      expect(lifecycleGate).toContain('public.institution_pilot_is_operational(institution.id)')
      expect(lifecycleGate).toContain('profile.id=program.student_id AND profile.deleted_at IS NULL')
      expect(lifecycleGate).toContain('NOT public.teacher_classroom_is_blocked(classroom.teacher_id,program.student_id)')
    }
    expect(review).toContain("'observed_improvement'")
    expect(review).toMatch(/week_start-14\)::timestamp AT TIME ZONE 'Europe\/Istanbul'/)
    expect(review).toMatch(/week_start\+14\)::timestamp AT TIME ZONE 'Europe\/Istanbul'/)
    expect(review).not.toContain('week_start::timestamptz')
    expect(sql).toContain('get_institution_student_diagnostic_sources')
    const reportHistory = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.get_institution_student_reports_v2'),
      sql.indexOf('-- Freeze publication/item edits'),
    )
    expect(reportHistory).toContain('JOIN public.profiles AS profile')
    expect(reportHistory).toContain('profile.id = membership.student_id AND profile.deleted_at IS NULL')
    expect(reportHistory).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*public\.get_institution_student_reports_v2\([\s\S]*public\.get_institution_student_reports\(uuid, uuid, text\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/)
    expect(reportHistory).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*public\.get_institution_student_reports_v2\([\s\S]*public\.get_institution_student_reports\(uuid, uuid, text\)[\s\S]*TO service_role/)
    expect(sql).toContain('migration 201 postcheck failed: tombstoned report reader boundary mismatch')
    expect(sql).toContain('user_diagnostic_outcome_state')
    expect(sql).toContain("v_staff_role='teacher' AND v_classroom.teacher_id<>p_user_id")
    expect(sql).toContain("item.scheduled_date<=p_as_of_date")
    expect(sql).toContain('AND item.outcome_code IS NOT NULL')
    expect(sql).toContain("AT TIME ZONE 'Europe/Istanbul'")
    expect(sql).toContain('v_today<v_item.scheduled_date')
    expect(sql).not.toContain('current_date<v_item.scheduled_date')
    expect(sql).toContain('institution_program_start_target(text,text,text,text,text)')
    expect(sql).toContain('outcome.code=p_outcome_code AND outcome.game=p_game')
    expect(sql).toContain('outcome.exam_ref=p_exam_ref AND outcome.taxonomy_version=p_taxonomy_version')
    expect(sql).toContain("RAISE EXCEPTION 'institution program outcome scope mismatch'")
    expect(sql).toContain("'category='||v_category||'&'")
    expect(sql).toContain("'exam_ref='||p_exam_ref||'&mode=practice'")
    expect(sql).toContain('v_category_outcome_count<>1')
    expect(sql).toContain("v_execution.taxonomy_version,v_item.outcome_code")
    expect(sql).toContain("v_program.taxonomy_version,v_item.outcome_code")
    expect(sql).toContain("'institution_request','free_pilot_request','classroom_request','program_execution'")
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_institution_student_program_history_v2')
    expect(sql).toContain("'reviewEligible',scoped.review_eligible")
    expect(sql).toContain('public.institution_study_program_review_ready(program.id,v_today)')
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.preview_institution_study_program_review')
    expect(sql).toContain("'program review requires a mature completed execution'")
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.review_institution_study_program')
    const serverOnlyAcl = sql.slice(
      sql.indexOf('REVOKE ALL ON FUNCTION public.institution_program_reconciliation_immutable'),
      sql.indexOf('-- Migration-local release gate'),
    )
    const serverOnlyRevoke = serverOnlyAcl.slice(
      0,
      serverOnlyAcl.indexOf('FROM PUBLIC,anon,authenticated,service_role;'),
    )
    const serverOnlyGrant = serverOnlyAcl.slice(serverOnlyAcl.indexOf('GRANT EXECUTE ON FUNCTION'))
    for (const identity of [
      'public.get_institution_student_program_history_v2(uuid,uuid,text,text,text)',
      'public.get_institution_student_program_history(uuid,uuid,text)',
      'public.preview_institution_study_program_review(uuid,text)',
      'public.review_institution_study_program(uuid,text,text,text,uuid)',
    ]) {
      expect(serverOnlyRevoke).toContain(identity)
      expect(serverOnlyGrant).toContain(identity)
    }
    expect(serverOnlyAcl).toMatch(/FROM PUBLIC,anon,authenticated,service_role;[\s\S]*TO service_role;/)
    expect(sql).toContain('v_has_replay')
    expect(sql).toContain("set_config('TimeZone','Europe/Istanbul',true)")
    expect(sql).not.toContain('current_date')
  })
})
