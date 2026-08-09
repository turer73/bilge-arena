import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '105_teacher_classroom_privacy.sql'),
  'utf8',
)

function functionBody(name, nextName) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  const end = nextName
    ? sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nextName}`, start + 1)
    : sql.indexOf('REVOKE ALL ON FUNCTION', start + 1)
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return sql.slice(start, end)
}

describe('105 teacher classroom privacy SQL contract', () => {
  it('creates ten private RLS tables and denies direct service-role DML', () => {
    const tables = [
      'teacher_classrooms',
      'teacher_classroom_requests',
      'teacher_classroom_invites',
      'teacher_classroom_memberships',
      'teacher_classroom_privacy_events',
      'teacher_assignments',
      'teacher_assignment_items',
      'teacher_assignment_recipients',
      'teacher_assignment_submissions',
      'teacher_assignment_submission_items',
    ]
    for (const table of tables) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`)
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`)
    }
    expect(sql.match(/ENABLE ROW LEVEL SECURITY/g)).toHaveLength(10)
    expect(sql).toMatch(/REVOKE ALL ON TABLE[\s\S]+FROM PUBLIC, anon, authenticated, service_role/)
  })

  it('seeds an admin-assigned pilot teacher permission and checks it on every teacher write', () => {
    expect(sql).toMatch(/'teacher_pilot'[\s\S]+ON CONFLICT \(slug\) DO UPDATE/)
    expect(sql).toContain("'teacher.classrooms.manage'")
    const teacherFunctions = [
      ['create_teacher_classroom', 'get_my_teacher_classrooms'],
      ['get_my_teacher_classrooms', 'issue_teacher_classroom_invite'],
      ['issue_teacher_classroom_invite', 'revoke_teacher_classroom_invite'],
      ['revoke_teacher_classroom_invite', 'preview_teacher_classroom_invite'],
      ['remove_teacher_classroom_member', 'publish_teacher_assignment'],
      ['publish_teacher_assignment', 'get_my_teacher_classroom_overview'],
      ['get_my_teacher_classroom_overview', 'get_my_teacher_assignments'],
    ]
    for (const [name, next] of teacherFunctions) {
      expect(functionBody(name, next)).toContain('teacher_classroom_is_teacher(p_user_id)')
    }
  })

  it('exposes only the bounded service-only RPC surface with fixed search paths', () => {
    const signatures = [
      'create_teacher_classroom(uuid, text, uuid)',
      'get_my_teacher_classrooms(uuid)',
      'issue_teacher_classroom_invite(uuid, uuid, text, timestamptz, smallint, uuid)',
      'revoke_teacher_classroom_invite(uuid, text, uuid)',
      'preview_teacher_classroom_invite(uuid, text)',
      'accept_teacher_classroom_invite(uuid, text, text, text, uuid)',
      'get_my_teacher_classroom_memberships(uuid)',
      'withdraw_teacher_classroom_membership(uuid, uuid, uuid)',
      'remove_teacher_classroom_member(uuid, uuid, text, uuid)',
      'publish_teacher_assignment(uuid, uuid, text, jsonb, timestamptz, timestamptz, uuid)',
      'get_my_teacher_classroom_overview(uuid, uuid)',
      'get_my_teacher_assignments(uuid)',
      'get_my_teacher_assignment(uuid, uuid)',
      'submit_teacher_assignment(uuid, uuid, jsonb, uuid)',
    ]
    for (const signature of signatures) {
      expect(sql).toContain(`public.${signature}`)
    }
    expect(sql.match(/SECURITY DEFINER\s+SET search_path = pg_catalog/g)).toHaveLength(18)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]+FROM PUBLIC, anon, authenticated, service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]+TO service_role/)
    expect(sql).not.toMatch(/TO anon|TO authenticated/)
  })

  it('keeps invites digest-only and separates notice, consent, withdrawal and removal audit', () => {
    expect(sql).toMatch(/token_digest text NOT NULL UNIQUE CHECK \(token_digest ~ '\^\[0-9a-f\]\{64\}\$'\)/)
    expect(sql).not.toMatch(/\b(raw_token|invite_token|token_plaintext)\b/)
    expect(sql).toMatch(/expires_at > created_at AND expires_at <= created_at \+ interval '7 days'/)
    expect(sql).toMatch(/used_count BETWEEN 0 AND max_uses/)
    expect(sql).toMatch(/teacher_classroom_one_active_member/)
    expect(sql).toContain("'notice_acknowledged', p_notice_version")
    expect(sql).toContain("'sharing_consented', p_consent_version")
    expect(sql).toContain("'sharing_withdrawn', NULL")
    expect(sql).toContain("'removed', NULL")
    expect(functionBody('accept_teacher_classroom_invite', 'withdraw_teacher_classroom_membership'))
      .toMatch(/pg_advisory_xact_lock[\s\S]+used_count = used_count \+ 1/)
  })

  it('snapshots only active valid bank questions and recipients under the class lock', () => {
    const publish = functionBody('publish_teacher_assignment', 'get_my_teacher_classroom_overview')
    expect(publish).toMatch(/jsonb_array_length\(p_items\) NOT BETWEEN 1 AND 30/)
    expect(publish).toContain("assignment items must contain exact position and questionId")
    expect(publish).toMatch(/question\.is_active[\s\S]+jsonb_typeof\(question\.content->'options'\)[\s\S]+question\.content->>'answer'/)
    expect(publish).toContain("'question', question.content->'question'")
    expect(publish).not.toContain("'answer', question.content")
    expect(publish).not.toContain("'solution', question.content")
    expect(publish).not.toContain("'hint', question.content")
    expect(publish).toMatch(/membership\.status = 'active'[\s\S]+profile\.deleted_at IS NULL[\s\S]+teacher_classroom_is_blocked/)
    expect(publish).toContain('assignment requires 1..40 active recipients')
  })

  it('uses one classroom lock order for accept and publish to avoid a deadlock', () => {
    const accept = functionBody('accept_teacher_classroom_invite', 'withdraw_teacher_classroom_membership')
    const publish = functionBody('publish_teacher_assignment', 'get_my_teacher_classroom_overview')
    const acceptAdvisory = accept.indexOf("'teacher-class:' || v_invite.classroom_id::text")
    const acceptRowLock = accept.indexOf('FROM public.teacher_classrooms', acceptAdvisory)
    const publishAdvisory = publish.indexOf("'teacher-class:' || p_classroom_id::text")
    const publishRowLock = publish.indexOf('FROM public.teacher_classrooms', publishAdvisory)
    expect(acceptAdvisory).toBeGreaterThanOrEqual(0)
    expect(acceptRowLock).toBeGreaterThan(acceptAdvisory)
    expect(publishAdvisory).toBeGreaterThanOrEqual(0)
    expect(publishRowLock).toBeGreaterThan(publishAdvisory)
  })

  it('strictly grades one owner submission without touching verified, reward, FSRS or mastery state', () => {
    const submit = functionBody('submit_teacher_assignment', null)
    expect(submit).toContain("answers require exact position and selectedOption")
    expect(submit).toMatch(/jsonb_array_length\(p_answers\) <> v_count/)
    expect(submit).toMatch(/selectedOption'[\s\S]+jsonb_array_length\(item\.content->'options'\)/)
    expect(submit).toContain('assignment submission payload mismatch')
    expect(submit).toContain('assignment is outside submission window')
    expect(submit).toContain('teacher_assignment_submission_items')
    expect(sql).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM) public\.(?:verified_attempts|game_sessions|session_answers|review_cards|review_logs|user_outcome_state|outcome_mastery_evidence|xp_log|reward_ledger|daily_quests|achievements|weekly_learning_league_contributions)/i)
  })

  it('teacher overview is aggregate-only and removes inactive, deleted or blocked identities', () => {
    const list = functionBody('get_my_teacher_classrooms', 'issue_teacher_classroom_invite')
    const overview = functionBody('get_my_teacher_classroom_overview', 'get_my_teacher_assignments')
    expect(list).toContain("'activeStudentCount'")
    expect(list).toContain("'assignmentCount'")
    expect(list).toContain('classroom.teacher_id = p_user_id')
    expect(list).not.toMatch(/'studentId'|'profileId'|'email'|'memberRef'/)
    expect(overview).toContain("'memberRef'")
    expect(overview).toContain("'alias'")
    expect(overview).toContain("'answeredCount'")
    expect(overview).toContain("'correctCount'")
    expect(overview).toContain("membership.status = 'active'")
    expect(overview).toContain('profile.deleted_at IS NULL')
    expect(overview).toContain('teacher_classroom_is_blocked')
    expect(overview).not.toMatch(/'studentId'|'profileId'|'email'|'questionId'|'selectedOption'|'isCorrect'|'correctOption'|'sessionId'|'attemptId'|'outcomeId'|'mastery'|'fsrs'/)
  })

  it('student reads are owner-scoped and active results reveal keys only after final submission', () => {
    const memberships = functionBody(
      'get_my_teacher_classroom_memberships',
      'withdraw_teacher_classroom_membership',
    )
    const list = functionBody('get_my_teacher_assignments', 'get_my_teacher_assignment')
    const getOne = functionBody('get_my_teacher_assignment', 'submit_teacher_assignment')
    expect(memberships).toMatch(/membership\.student_id = p_user_id[\s\S]+membership\.status = 'active'/)
    expect(memberships).toContain("'teacherAlias'")
    expect(memberships).not.toMatch(/'studentId'|'memberRef'|'email'/)
    expect(list).toMatch(/recipient\.student_id = p_user_id[\s\S]+membership\.student_id = p_user_id[\s\S]+membership\.status = 'active'/)
    expect(getOne).toMatch(/CASE WHEN v_submission\.id IS NULL THEN NULL ELSE jsonb_build_object/)
    expect(getOne).toContain("'correctOption', assignment_item.correct_option")
    expect(getOne).toContain("'reward', jsonb_build_object('xp', 0, 'coins', 0, 'socialPoints', 0)")
    expect(getOne).toMatch(/profiles WHERE id = p_user_id AND deleted_at IS NULL/)
    expect(functionBody('submit_teacher_assignment', null))
      .toMatch(/profiles WHERE id = p_user_id AND deleted_at IS NULL/)
  })
})
