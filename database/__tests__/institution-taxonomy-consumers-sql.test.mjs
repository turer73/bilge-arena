import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const sql = readFileSync(
  new URL('../migrations/183_institution_taxonomy_consumer_alignment.sql', import.meta.url),
  'utf8',
)

describe('institution taxonomy consumer alignment migration', () => {
  it('backfills only provable historical targets and persists an immutable taxonomy', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS taxonomy_version text')
    expect(sql).toContain("SET taxonomy_version = 'ba-tyt-math-v1'")
    expect(sql).toContain('institution program taxonomy backfill has unresolvable targets')
    expect(sql).toContain('ALTER COLUMN taxonomy_version SET NOT NULL')
    expect(sql).toContain('daily_minute_limit,model_version,item_count,taxonomy_version')
  })

  it('binds draft creation and edits to the exact stored curriculum scope', () => {
    expect(sql).toContain("scope.release_status = 'released'")
    expect(sql).toContain('outcome.taxonomy_version = v_taxonomy_version')
    expect(sql).toContain('outcome.taxonomy_version = v_program.taxonomy_version')
    expect(sql).toContain("'taxonomyVersion', v_taxonomy_version")
    expect(sql).toContain("v_taxonomy_version IS DISTINCT FROM 'ba-tyt-math-v1'")
    expect(sql).toContain("v_question_exam_ref IS DISTINCT FROM 'TYT'")
    expect(sql).toContain('NOT COALESCE(v_diagnostic_enabled, false)')
    expect(sql).toContain("scope.question_exam_ref = 'TYT'")
    expect(sql).toContain("item.task_type = 'diagnostic'")
    expect(sql).toContain('public.free_pilot_legacy_program_publish')
    expect(sql).toContain('v_request.payload_hash = v_legacy_hash')
    expect(sql).toContain("'taxonomyVersion', v_program.taxonomy_version")
    const createStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.create_institution_study_program_draft')
    const replayLookup = sql.indexOf('SELECT * INTO v_request FROM public.pilot_institution_requests', createStart)
    const releaseLookup = sql.indexOf('SELECT scope.taxonomy_version', createStart)
    expect(replayLookup).toBeGreaterThan(createStart)
    expect(releaseLookup).toBeGreaterThan(createStart)
    expect(replayLookup).toBeLessThan(releaseLookup)
    const createEnd = sql.indexOf('CREATE OR REPLACE FUNCTION public.update_institution_study_program_draft', createStart)
    expect(sql.slice(releaseLookup, createEnd)).toContain('FOR SHARE')

    const updateStart = createEnd
    const updateEnd = sql.indexOf('CREATE OR REPLACE FUNCTION public.publish_institution_study_program', updateStart)
    const updateSql = sql.slice(updateStart, updateEnd)
    const updateReplay = updateSql.indexOf("operation = 'update_study_program_draft'")
    const updateGate = updateSql.indexOf("scope.question_exam_ref = 'TYT'")
    expect(updateReplay).toBeGreaterThanOrEqual(0)
    expect(updateReplay).toBeLessThan(updateGate)
    expect(updateSql).toContain("':program-update:'")
    expect(updateSql).toContain('FOR SHARE')

    const publishStart = updateEnd
    const publishEnd = sql.indexOf('CREATE OR REPLACE FUNCTION public.institution_study_program_review_evidence', publishStart)
    const publishSql = sql.slice(publishStart, publishEnd)
    expect(publishSql).toContain("scope.question_exam_ref = 'TYT'")
    expect(publishSql).toContain('FOR UPDATE')
    expect(publishSql).toContain('FOR SHARE')
  })

  it('reviews a program against its generation taxonomy even after retirement', () => {
    const reviewStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.institution_study_program_review_evidence')
    const reviewEnd = sql.indexOf('REVOKE ALL ON FUNCTION', reviewStart)
    const reviewSql = sql.slice(reviewStart, reviewEnd)
    expect(reviewSql).toContain('outcome.taxonomy_version = v_program.taxonomy_version')
    expect(reviewSql).not.toContain('outcome.is_active')
  })

  it('keeps the transition wrapper and exposes the explicit scope overload only server-side', () => {
    expect(sql).toContain('p_window_end timestamptz,\n  p_taxonomy_version text')
    expect(sql).toContain('p_user_id, p_classroom_id, p_window_end, v_taxonomy_version')
    expect(sql).toContain('public.get_institution_classroom_growth_metrics(uuid, uuid, timestamptz, text)')
    expect(sql).toContain('TO service_role')
  })
})
