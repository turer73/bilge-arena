import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sql = readFileSync(join(root, 'migrations', '166_question_outcome_mapping_candidates.sql'), 'utf8')
const script = readFileSync(join(root, 'queue-question-outcome-mapping-candidates.mjs'), 'utf8')
const realChainTest = readFileSync(join(root, '__tests__', 'question-content-governance-postgres.integration.test.mjs'), 'utf8')
const packageJson = JSON.parse(readFileSync(join(root, '..', 'package.json'), 'utf8'))

describe('166 governed question outcome candidate queue SQL', () => {
  it('keeps candidates and audit events private behind explicitly granted RPCs', () => {
    expect(sql).toMatch(/ALTER TABLE public\.question_outcome_mapping_candidates ENABLE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/REVOKE ALL ON TABLE[\s\S]*question_outcome_mapping_candidate_events[\s\S]*FROM PUBLIC, anon, authenticated, service_role/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*transfer_question_outcome_mapping_candidate\(uuid,uuid,uuid,text,uuid\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*enqueue_question_outcome_mapping_candidates\(uuid,uuid\)[\s\S]*TO service_role/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION[\s\S]*transfer_question_outcome_mapping_candidate\(uuid,uuid,uuid,text,uuid\)[\s\S]*TO authenticated/)
    expect(sql).not.toMatch(/GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL)[\s\S]*question_outcome_mapping_candidates/i)
    expect(sql.indexOf("NOTIFY pgrst, 'reload schema'"))
      .toBeLessThan(sql.lastIndexOf('COMMIT;'))
  })

  it('binds deterministic candidates to revision/hash/scope and never bulk-writes active mappings', () => {
    expect(sql).toContain("'exact-scope-candidate@1'")
    expect(sql).toMatch(/'baseRevisionId',classified\.base_revision_id[\s\S]*'contentSha256',classified\.content_sha256[\s\S]*'candidateSetSha256',classified\.candidate_set_sha256/)
    expect(sql).toContain('public.curriculum_outcome_scope_valid')
    expect(sql).toMatch(/question_active_outcome_mapping_valid[\s\S]*count\(\*\)[\s\S]*BETWEEN 1 AND 5[\s\S]*mapping\.is_primary\)=1/)
    expect(sql).toMatch(/candidate\.status='stale'[\s\S]*resolution\.status='rejected'[\s\S]*'reopened'/)
    expect(sql).not.toMatch(/INSERT\s+INTO\s+public\.question_outcomes\b/i)
    expect(sql).not.toMatch(/UPDATE\s+public\.question_outcomes\b/i)
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.question_outcomes\b/i)
    const enqueue = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.enqueue_question_outcome_mapping_candidates'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.list_question_outcome_mapping_candidates'),
    )
    expect(enqueue.match(/question_outcome_mapping_candidate_snapshot\(\)/g)).toHaveLength(1)
    expect(enqueue).toContain('jsonb_array_elements(v_snapshot_rows)')
  })

  it('routes explicit human transfer through governed revision evidence', () => {
    const transfer = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.transfer_question_outcome_mapping_candidate'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.reject_question_outcome_mapping_candidate'),
    )
    expect(transfer).toContain('public.question_outcome_mapping_actor_has_aal2')
    expect(transfer).toContain("public.content_governance_has_permission(p_actor_user_id,'content.prepare')")
    expect(transfer).toMatch(/char_length\(btrim\(COALESCE\(p_rationale,''\)\)\) NOT BETWEEN 10 AND 1000/)
    expect(transfer).toContain('public.set_question_revision_outcomes(')
    expect(transfer).toContain("event_type,request_id,details")
    expect(transfer).toContain("v_revision.status NOT IN ('draft','stage1_approved')")
    expect(transfer).toMatch(/EXISTS \([\s\S]*public\.question_revision_outcomes/)
  })

  it('does not expose question content or answer fields in the queue projection', () => {
    const projection = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.list_question_outcome_mapping_candidates'),
      sql.indexOf('CREATE OR REPLACE FUNCTION public.transfer_question_outcome_mapping_candidate'),
    )
    for (const forbidden of ["'content'", "'contentSha256'", "'answer'", "'solution'", "'explanation'", "'hint'"]) {
      expect(projection).not.toContain(forbidden)
    }
  })

  it('ships an inspect-first operational command with two explicit production write gates', () => {
    expect(script).toContain("const apply = args.includes('--apply')")
    expect(script).toContain("args.includes('--confirm-production')")
    expect(script).toContain("process.env.APPLY_QUESTION_OUTCOME_CANDIDATES !== '1'")
    expect(script).toContain("changed: false")
    expect(script).toContain('enqueue.reopened > 0')
    expect(packageJson.scripts['outcomes:candidates']).toBe('node database/queue-question-outcome-mapping-candidates.mjs')
    expect(packageJson.scripts['test:outcome-candidates:pg']).toContain('question-outcome-mapping-candidates-postgres.integration.test.mjs')
    expect(packageJson.scripts['test:question-quality:pg']).toContain('--no-file-parallelism')
    expect(packageJson.scripts['test:question-quality:pg']).toContain('question-outcome-mapping-candidates-postgres.integration.test.mjs')
  })

  it('is accepted against the real 164 set-review-publish chain, not only a stub fixture', () => {
    expect(realChainTest).toContain('await client.query(outcomeCandidatesMigration)')
    expect(realChainTest).toContain('public.transfer_question_outcome_mapping_candidate($1,$2,$3,$4,$5)')
    expect(realChainTest).toContain('public.review_question_content_revision($1,$2,$3::smallint,$4,$5,$6)')
    expect(realChainTest).toContain('public.publish_question_content_revision($1,$2,$3)')
  })
})
