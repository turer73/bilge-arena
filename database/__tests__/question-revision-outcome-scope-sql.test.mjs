import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  new URL('../migrations/164_question_revision_outcome_scope.sql', import.meta.url),
  'utf8',
)

describe('migration 164 revision outcome scope contract', () => {
  it('guards every new revision mapping with active exact game/category/exam taxonomy scope', () => {
    expect(sql).toContain('trg_question_revision_outcome_scope_guard')
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF revision_id,outcome_id/)
    expect(sql).toContain('curriculum_outcome_scope_valid')
    expect(sql).toContain("ARRAY['outcome','topic','unit','course']::text[]")
    expect(sql).toContain('WHERE NOT node.is_active')
    expect(sql).toContain('WHERE outcome.id=NEW.outcome_id')
    expect(sql).toContain('FOR SHARE OF outcome')
    expect(sql).toContain('FOR SHARE OF node')
    expect(sql).toContain('outcome.game IS NOT DISTINCT FROM p_game')
    expect(sql).toContain('outcome.category IS NOT DISTINCT FROM p_category')
    expect(sql).toContain('outcome.exam_ref IS NOT DISTINCT FROM p_exam_ref')
  })

  it('rechecks evidence at publish time instead of trusting draft-time state', () => {
    expect(sql).toContain('lock_question_revision_outcome_scope(r.id)')
    expect(sql).toContain('LOCK TABLE public.question_revision_outcomes IN SHARE MODE')
    expect(sql).toContain('FOR SHARE OF mapping,outcome')
    expect(sql).toContain('question_revision_outcomes_valid(r.id)')
    expect(sql).toContain('revision evidence incomplete or outside academic scope')
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.publish_question_content_revision/)
  })

  it('stores legacy corrections as mapping-pending drafts but blocks stage two until evidence exists', () => {
    expect(sql).toContain('content_governance_validate_revision_payload')
    expect(sql).toContain("'mappingRequired',jsonb_array_length(p_payload->'outcomes')=0")
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.set_question_revision_outcomes')
    expect(sql).toContain("only pre-stage-two revision outcomes can be changed")
    expect(sql).toContain("revision.status='stage1_approved'")
    expect(sql).toContain('stage1ApprovalInvalidated')
    expect(sql).toContain('SET status=revision.status')
    expect(sql).toContain('outcomes_prepared_by=p_user_id')
    expect(sql).toContain('OR r.outcomes_prepared_by=p_user_id')
    expect(sql).toContain('a.reviewer_id<>r.outcomes_prepared_by')
    expect(sql).toContain('question_content_revisions_outcomes_prepared_by_fkey')
    expect(sql).toContain('ORDER BY (item->>\'outcomeId\')::uuid')
    expect(sql).toContain('stage two requires exact-scope outcome evidence')
    expect(sql).toContain("'openRevisionUnmappedOrInvalid'")
  })

  it('keeps coverage privileged and deliberately avoids a bulk legacy mapping write', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_question_outcome_coverage')
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_question_outcome_coverage\(uuid\),[\s\S]*TO service_role/)
    expect(sql).toContain("has_function_privilege('authenticated','public.get_question_outcome_coverage(uuid)','EXECUTE')")
    expect(sql).toContain('questions_published_revision_question_fkey')
    expect(sql).toContain("conname='question_content_revisions_id_question_id_key'")
    expect(sql).not.toContain('DROP CONSTRAINT IF EXISTS question_content_revisions_id_question_id_key')
    expect(sql).toContain("SET LOCAL lock_timeout = '10s'")
    expect(sql).toContain("revision.status='published'")
    expect(sql).toContain('AND NOT public.curriculum_outcome_scope_valid(')
    expect(sql).not.toMatch(/INSERT INTO public\.question_revision_outcomes\s*\([^)]*\)\s*SELECT\s+(?:question|q)\./i)
    expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;/)
  })
})
