import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '140_adaptive_diagnostic_evidence_v2.sql'),
  'utf8',
)

describe('140 adaptive diagnostic revision evidence contract', () => {
  it('preserves the issued revision snapshot and raw selected option', () => {
    expect(sql).toMatch(/current_question_revision_id uuid REFERENCES public\.question_content_revisions/)
    expect(sql).toMatch(/current_question_content_sha256 text/)
    expect(sql).toMatch(/current_question_outcome_id uuid REFERENCES public\.curriculum_outcomes/)
    expect(sql).toMatch(/current_question_difficulty smallint/)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS selected_option smallint/)
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS question_revision_id uuid/)
    expect(sql).toMatch(/'revision_snapshot'/)
    expect(sql).toMatch(/p_selected_option,v_session\.current_question_revision_id/)
    expect(sql).toMatch(/v_session\.current_question_outcome_id,v_sequence/)
    expect(sql).toMatch(/v_session\.current_question_difficulty,v_is_correct/)
  })

  it('replays legacy rows without inventing a historical selected option', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.record_adaptive_diagnostic_answer_v2')
    const body = sql.slice(start)
    expect(body).toMatch(/v_existing\.evidence_kind<>'legacy_unbound'[\s\S]+v_existing\.selected_option IS DISTINCT FROM p_selected_option/)
  })

  it('grades in the locked service-only RPC instead of trusting client correctness', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.record_adaptive_diagnostic_answer_v2')
    const body = sql.slice(start)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(body).toMatch(/FROM public\.adaptive_diagnostic_sessions[\s\S]+FOR UPDATE/)
    expect(body).toMatch(/v_is_correct:=p_selected_option=v_session\.current_question_correct_option/)
    expect(body).not.toContain('p_is_correct')
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.record_adaptive_diagnostic_answer_v2[\s\S]+authenticated,service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_adaptive_diagnostic_answer_v2[\s\S]+TO service_role/)
  })

  it('keeps client and server elapsed time as explicitly labelled separate evidence', () => {
    expect(sql).toMatch(/server_response_time_ms integer/)
    expect(sql).toMatch(/response_time_source text/)
    expect(sql).toMatch(/current_question_issued_at:=clock_timestamp\(\)/)
    expect(sql).toMatch(/clock_timestamp\(\)-v_session\.current_question_issued_at/)
    expect(sql).toContain("'client_reported_with_server_elapsed'")
  })

  it('does not fabricate a wrong answer when the database clock expires the session', () => {
    const start = sql.indexOf('CREATE OR REPLACE FUNCTION public.record_adaptive_diagnostic_answer_v2')
    const body = sql.slice(start)
    const expiry = body.indexOf('v_session.expires_at<=clock_timestamp()')
    const insert = body.indexOf('INSERT INTO public.adaptive_diagnostic_answers')
    expect(expiry).toBeGreaterThanOrEqual(0)
    expect(insert).toBeGreaterThan(expiry)
    expect(body.slice(expiry, insert)).toMatch(/RETURN jsonb_build_object/)
  })

  it('abandons only pre-v2 active sessions so a migration retry is non-destructive', () => {
    expect(sql).toMatch(/WHERE status='active'[\s\S]+current_question_id IS NOT NULL[\s\S]+current_question_revision_id IS NULL/)
  })

  it('returns only the immutable public question snapshot', () => {
    expect(sql).toContain('get_adaptive_diagnostic_question_v2')
    expect(sql).toMatch(/revision\.id=session\.current_question_revision_id/)
    expect(sql).toMatch(/revision\.content_sha256=session\.current_question_content_sha256/)
    const publicRpc = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.get_adaptive_diagnostic_question_v2'))
    expect(publicRpc).not.toMatch(/'answer'\s*,/)
    expect(publicRpc).not.toMatch(/'solution'\s*,/)
  })
})
