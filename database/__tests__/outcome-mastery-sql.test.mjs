import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const migration = readFileSync(
  fileURLToPath(new URL('../migrations/086_outcome_mastery_pilot.sql', import.meta.url)),
  'utf8',
)
const repair = readFileSync(
  fileURLToPath(new URL('../repair-outcome-state.sql', import.meta.url)),
  'utf8',
)
const fullSchema = readFileSync(
  fileURLToPath(new URL('../full-schema.sql', import.meta.url)),
  'utf8',
)

describe('outcome mastery SQL guardlari', () => {
  it('skipleri yeni kanittan ve tarihsel onarimdan dislar', () => {
    expect(migration).toContain('IF COALESCE(NEW.is_skipped, FALSE) THEN\n    RETURN NEW;')
    expect(repair).toContain('AND COALESCE(answer.is_skipped, FALSE) = FALSE')
    expect(fullSchema).toContain('IF COALESCE(NEW.is_skipped, FALSE) THEN\n    RETURN NEW;')
  })

  it('session_answers icin yeni blocking composite index eklemez', () => {
    expect(migration).not.toContain('idx_answers_user_question_time')
    expect(fullSchema).not.toContain('idx_answers_user_question_time')
  })

  it('full schema migration 086 butunluk ve function guvenligiyle uyumludur', () => {
    expect(fullSchema).toContain("CHECK (game IN (\n                'wordquest', 'matematik', 'turkce', 'fen', 'sosyal'\n              ))")
    expect(fullSchema).toContain('correct_attempts >= 0 AND correct_attempts <= attempts')
    expect(fullSchema).toContain('weighted_possible >= 0 AND weighted_earned <= weighted_possible')
    expect(fullSchema).toContain('delayed_correct >= 0 AND delayed_correct <= correct_attempts')
    expect(fullSchema).toContain('REVOKE ALL ON FUNCTION record_outcome_evidence() FROM PUBLIC, anon, authenticated;')
    expect(fullSchema).toContain('ON CONFLICT (code) DO UPDATE SET')
    expect(fullSchema).toContain("NOTIFY pgrst, 'reload schema';")
  })

  it('repair maintenance penceresini acquisition, statement ve transaction ile sinirlar', () => {
    expect(repair).toContain("SET LOCAL lock_timeout = '3s';")
    expect(repair).toContain("SET LOCAL statement_timeout = '12s';")
    expect(repair).toContain("SET LOCAL transaction_timeout = '15s';")
  })
})
