import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const sql = readFileSync(join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'migrations',
  '202_mastery_distinct_evidence_days.sql',
), 'utf8')

describe('202 distinct verified mastery evidence days migration', () => {
  it('bounds production locking and execution instead of waiting indefinitely', () => {
    expect(sql).toMatch(/SET LOCAL lock_timeout = '10s'/)
    expect(sql).toMatch(/SET LOCAL statement_timeout = '15min'/)
  })

  it('derives a stored Türkiye day only from immutable verified completion provenance', () => {
    expect(sql).toMatch(/verified_completed_at timestamptz/)
    expect(sql).toMatch(/evidence_day_tr date[\s\S]*GENERATED ALWAYS AS[\s\S]*AT TIME ZONE 'Europe\/Istanbul'/)
    expect(sql).toMatch(/NEW\.verified_completed_at := v_attempt\.completed_at/)
    expect(sql).toMatch(/BEFORE INSERT ON public\.mastery_outcome_evidence/)
    expect(sql).toMatch(/mastery_evidence_verified_day_immutable/)
    expect(sql).not.toMatch(/answered_at\s+AT TIME ZONE|NEW\.created_at/)
  })

  it('fails closed on legacy rows that do not prove attempt, answer and session boundaries', () => {
    expect(sql).toMatch(/legacy mastery evidence has unverifiable attempt provenance/)
    expect(sql).toMatch(/attempt\.completed_at IS NULL/)
    expect(sql).toMatch(/attempt\.user_id IS DISTINCT FROM evidence\.user_id/)
    expect(sql).toMatch(/evidence\.question_id = ANY\(attempt\.question_ids\)/)
    expect(sql).toMatch(/answer\.session_id IS DISTINCT FROM evidence\.session_id/)
    expect(sql).toMatch(/COALESCE\(answer\.is_skipped, false\)/)
    expect(sql).toMatch(/evidence\.verified_completed_at IS NOT NULL[\s\S]*IS DISTINCT FROM attempt\.completed_at/)
    expect(sql).toMatch(/evidence\.verified_completed_at IS NULL/)
  })

  it('materializes at most one evidence unit per user, outcome and Türkiye day', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.mastery_outcome_evidence_days/)
    expect(sql).toMatch(/PRIMARY KEY \(user_id, outcome_id, evidence_day_tr\)/)
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS mastery_outcome_evidence_days_source_uidx[\s\S]*first_answer_id, outcome_id/)
    expect(sql).toMatch(/first_answer_id[\s\S]*first_attempt_id[\s\S]*first_question_id/)
    expect(sql).toMatch(/ON CONFLICT \(user_id, outcome_id, evidence_day_tr\) DO NOTHING/)
    expect(sql).toMatch(/verified_evidence_days = state\.verified_evidence_days \+ 1/)
    expect(sql).toMatch(/DEFERRABLE INITIALLY DEFERRED/)
    expect(sql).toMatch(/verified_evidence_days <= v2_attempts/)
  })

  it('keeps the provenance ledger private, immutable and privacy-cascade compatible', () => {
    expect(sql).toMatch(/ALTER TABLE public\.mastery_outcome_evidence_days ENABLE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.mastery_outcome_evidence_days[\s\S]*service_role/)
    expect(sql).toMatch(/BEFORE UPDATE ON public\.mastery_outcome_evidence_days/)
    expect(sql).not.toMatch(/BEFORE UPDATE OR DELETE ON public\.mastery_outcome_evidence_days/)
    expect(sql).toMatch(/mastery outcome evidence days are immutable/)
    expect(sql).toMatch(/first_attempt_id[\s\S]*ON DELETE CASCADE/)
    expect(sql).toMatch(/mastery_outcome_evidence\(answer_id, outcome_id\)[\s\S]*ON DELETE CASCADE/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*record_mastery_distinct_evidence_day\(\)[\s\S]*service_role/)
    expect(sql).toMatch(/verified evidence day aggregate postcheck failed/)
    expect(sql).toMatch(/verified evidence day source provenance postcheck failed/)
    expect(sql).toMatch(/verified evidence day ACL or trigger postcheck failed/)
  })
})
