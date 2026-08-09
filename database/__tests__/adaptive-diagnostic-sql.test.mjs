import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '098_adaptive_diagnostic.sql'),
  'utf8',
)

describe('098 adaptive diagnostic migration', () => {
  it('stores a private exact-scope session and append-only answer evidence', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.adaptive_diagnostic_sessions/)
    expect(sql).toMatch(/game text NOT NULL CHECK \(game = 'matematik'\)/)
    expect(sql).toMatch(/taxonomy_version text NOT NULL CHECK \(taxonomy_version = 'ba-tyt-math-v1'\)/)
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS adaptive_diagnostic_one_active_scope_idx[\s\S]*WHERE status = 'active'/)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.adaptive_diagnostic_answers/)
    expect(sql).toMatch(/UNIQUE \(session_id,request_id\)/)
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.adaptive_diagnostic_answers/)
    expect(sql).not.toMatch(/selected_option|answer_content|solution|free_text/)
  })

  it('starts only a complete six-outcome pilot and resumes one locked active session', () => {
    expect(sql).toMatch(/pg_advisory_xact_lock/)
    expect(sql).toMatch(/status = 'active'[\s\S]*FOR UPDATE/)
    expect(sql).toMatch(/v_outcome_count <> 6 OR v_covered_candidate_count <> 6[\s\S]*v_double_candidate_count < 4[\s\S]*v_total_candidate_count < 10/)
    expect(sql).toMatch(/first question is not an exact single-outcome pilot question/)
    expect(sql).toMatch(/HAVING count\(DISTINCT outcome\.id\) = 1[\s\S]*bool_and\(outcome\.category = question\.category\)/)
    expect(sql).toMatch(/THEN 'recheck' ELSE 'initial'/)
    expect(sql).toMatch(/interval '30 minutes'/)
  })

  it('records answers atomically with replay, coverage, expiry, and per-outcome bounds', () => {
    expect(sql).toMatch(/WHERE id = p_session_id[\s\S]*FOR UPDATE/)
    expect(sql).toMatch(/answer\.request_id = p_request_id OR answer\.question_id = p_question_id/)
    expect(sql).toMatch(/'alreadyProcessed',true/)
    expect(sql).toMatch(/response time must be between 100 and 600000 ms/)
    expect(sql).toMatch(/an outcome cannot be measured more than twice/)
    expect(sql).toMatch(/all pilot outcomes must be covered before confirmation questions/)
    expect(sql).toMatch(/v_status := CASE WHEN v_covered = 6 AND v_sequence = 10 THEN 'completed' ELSE 'abandoned' END/)
    expect(sql).toMatch(/ON CONFLICT \(user_id,outcome_id\) DO UPDATE SET/)
  })

  it('keeps all raw tables private and exposes only owner-bound service RPCs', () => {
    expect(sql.match(/ENABLE ROW LEVEL SECURITY/g)).toHaveLength(3)
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.adaptive_diagnostic_sessions, public\.adaptive_diagnostic_answers, public\.user_diagnostic_outcome_state[\s\S]*service_role/)
    expect(sql).toMatch(/GRANT SELECT ON TABLE public\.adaptive_diagnostic_sessions, public\.adaptive_diagnostic_answers, public\.user_diagnostic_outcome_state[\s\S]*TO service_role/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.resolve_adaptive_diagnostic_question\(uuid\),[\s\S]*service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.start_adaptive_diagnostic\(uuid,uuid,uuid\),[\s\S]*TO service_role/)
    expect(sql).toMatch(/v_session\.user_id IS DISTINCT FROM p_user_id[\s\S]*42501/)
  })
})
