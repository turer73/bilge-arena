import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const sql = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', '139_question_appeal_evidence_v2.sql'),
  'utf8',
)

function body(name, next = 'CREATE OR REPLACE FUNCTION') {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  const nextIndex = sql.indexOf(next, start + 1)
  const end = nextIndex === -1 ? sql.length : nextIndex
  expect(start, `${name} function is missing`).toBeGreaterThanOrEqual(0)
  expect(end, `${name} function boundary is missing`).toBeGreaterThan(start)
  return sql.slice(start, end)
}

describe('139 question appeal evidence v2 SQL contract', () => {
  it('stores attempt-bound evidence kind and keeps the evidence record revision-aware', () => {
    expect(sql).toMatch(/ALTER TABLE public\.question_appeals[\s\S]+ADD COLUMN IF NOT EXISTS attempt_id\s+uuid/)
    expect(sql).toMatch(/ALTER TABLE public\.question_appeals[\s\S]+ADD COLUMN IF NOT EXISTS evidence_kind\s+text/)
    expect(sql).toMatch(/evidence_kind[\s\S]+(legacy_report|legacy_session|current_revision|issued_attempt|verified_session)/)
    expect(sql).toContain('revision_id')
  })

  it('accepts only verified completed session evidence joined to immutable attempt snapshots', () => {
    const evidence = body('submit_question_appeal_v2', 'CREATE OR REPLACE FUNCTION')
    expect(evidence).toMatch(/(?:FROM|JOIN) public\.verified_attempts\s+\w+[\s\S]+session_id/)
    expect(evidence).toMatch(/JOIN public\.verified_attempt_question_revisions\s+\w+\s+ON[\s\S]+attempt_id/)
    expect(evidence).toMatch(/completed_at\s+IS NOT NULL/)
    expect(evidence).toMatch(/revision_id/)
  })

  it('binds issued-attempt evidence to the authenticated owner and its question snapshot', () => {
    const evidence = body('submit_question_appeal_v2', 'CREATE OR REPLACE FUNCTION')
    expect(evidence).toMatch(/verified_attempts[\s\S]+user_id\s*=\s*p_user_id/)
    expect(evidence).toMatch(/va\.id\s*=\s*p_attempt_id|attempt_id\s*=\s*p_attempt_id|p_attempt_id\s*=\s*\w+\.id/)
    expect(evidence).toMatch(/verified_attempt_question_revisions/)
    expect(evidence).toMatch(/question_id[\s\S]+p_question_id|p_question_id[\s\S]+question_id/)
    expect(evidence).toMatch(/snap\.revision_id|revision_id[\s\S]+snap/)
    expect(evidence).toMatch(/owner mismatch|owner|permission/i)
  })

  it('rejects ambiguous dual evidence and preserves the published-revision fallback', () => {
    const submit = body('submit_question_appeal_v2', 'CREATE OR REPLACE FUNCTION')
    expect(submit).toMatch(/p_session_answer_id\s+IS NOT NULL[\s\S]{0,500}p_attempt_id\s+IS NOT NULL|p_attempt_id\s+IS NOT NULL[\s\S]{0,500}p_session_answer_id\s+IS NOT NULL/)
    expect(submit).toMatch(/both|exactly one|ambiguous|invalid appeal evidence|evidence kind/i)
    expect(submit).toContain('q.published_revision_id')
    expect(submit).toMatch(/FROM public\.questions\s+q/)
  })

  it('keeps evidence writes service-only', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.submit_question_appeal_v2\([^)]*\)[\s\S]+FROM PUBLIC,anon,authenticated/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.submit_question_appeal_v2\([^)]*\)[\s\S]+TO service_role/)
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.submit_question_appeal_v2\([^)]*\)[\s\S]+TO (?:anon|authenticated)/)
  })

  it('projects evidenceKind and hasVerifiedEvidence in the admin queue without raw evidence identifiers', () => {
    const queue = body('get_question_appeal_queue', 'CREATE OR REPLACE FUNCTION')
    expect(queue).toContain("'evidenceKind'")
    expect(queue).toContain("'hasVerifiedEvidence'")
    expect(queue).not.toContain("'attemptId'")
    expect(queue).not.toContain("'sessionAnswerId'")
  })

  it('uses request payload hashing and replay-safe governance persistence', () => {
    const submit = body('submit_question_appeal_v2', 'CREATE OR REPLACE FUNCTION')
    expect(submit).toContain("content_governance_lock_request(p_user_id,'submit_appeal_v2',p_request_id)")
    expect(submit).toMatch(/content_governance_hash\(jsonb_build_object/)
    expect(submit).toMatch(/payload_hash/)
    expect(submit).toMatch(/appeal request payload mismatch/)
    expect(submit).toMatch(/replayed.*true|true.*replayed/s)
    expect(submit).toMatch(/content_governance_requests/)
  })
})
