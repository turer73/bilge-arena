import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const validation = readFileSync(new URL('../migrations/136_question_validation_pipeline.sql', import.meta.url), 'utf8')
const psychometrics = readFileSync(new URL('../migrations/137_question_revision_psychometrics_v2.sql', import.meta.url), 'utf8')

describe('question validation persistence and publish gate SQL', () => {
  it('stores the exact replay and cache identity', () => {
    for (const field of [
      'input_snapshot', 'provider_id', 'model_id', 'prompt_version',
      'generation_config_sha256', 'generation_config', 'policy_version', 'executed_at',
    ]) expect(validation).toContain(field)
    expect(validation).toContain('question_validation_runs_dedup_v2')
  })

  it('binds a derived decision to revision and content hash before publish', () => {
    expect(validation).toContain('CREATE TABLE IF NOT EXISTS public.question_validation_decisions')
    expect(validation).toContain('trg_question_validation_publish_gate')
    expect(validation).toMatch(/content_sha256\s*=\s*v_revision\.content_sha256/)
    expect(validation).toContain("v_verdict NOT IN ('APPROVED','NEEDS_REVIEW')")
    // Rollout is explicitly staged; operator enables only after backfill.
    expect(validation).toContain('enforce_publish_gate boolean NOT NULL DEFAULT false')
  })

  it('grants the service runner read-only access to its exact source columns', () => {
    expect(validation).toMatch(/GRANT SELECT \(id, question_id,[\s\S]+question_content_revisions TO service_role/)
    expect(validation).toMatch(/GRANT SELECT \(id, game,[\s\S]+public\.questions TO service_role/)
    expect(validation).not.toMatch(/GRANT (?:ALL|INSERT|UPDATE|DELETE)[^;]+question_content_revisions TO service_role/)
  })
})

describe('revision psychometrics v2 SQL', () => {
  it('uses the Wilson score interval rather than the legacy Wald formula', () => {
    expect(psychometrics).toContain('center:=(p+z2/(2*n))/(1+z2/n)')
    expect(psychometrics).toContain('margin:=1.96*sqrt((p*(1-p)+z2/(4*n))/n)/(1+z2/n)')
    expect(psychometrics).not.toContain('(good::numeric/n)-1.96*sqrt')
  })

  it('filters to first exposure without hints and materializes each option', () => {
    expect(psychometrics).toContain('verified_attempt_hint_events')
    expect(psychometrics).toContain('session_answers earlier')
    expect(psychometrics).toContain('time_taken_sec BETWEEN 2 AND 600')
    expect(psychometrics).toContain('CREATE TABLE IF NOT EXISTS public.question_option_statistics')
    expect(psychometrics).toContain('generate_series(0,r.option_count-1)')
  })
})
