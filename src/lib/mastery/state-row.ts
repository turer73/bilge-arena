import type { MasteryStateRowInput } from './build-response'

export interface MasteryStateRow {
  outcome_id: string
  attempts: number
  correct_attempts: number
  weighted_earned: number | string
  weighted_possible: number | string
  delayed_correct: number
  v2_attempts: number
  difficulty_weighted_earned: number | string
  difficulty_weighted_possible: number | string
  timed_attempts: number
  total_time_sec: number | string
  fast_wrong: number
  hinted_attempts: number
  hint_stage_sum: number | string
  guess_annotations: number
  careless_annotations: number
  verified_evidence_days: number
  last_answered_at: string | null
}

export const MASTERY_STATE_COLUMNS = 'outcome_id, attempts, correct_attempts, weighted_earned, weighted_possible, delayed_correct, v2_attempts, difficulty_weighted_earned, difficulty_weighted_possible, timed_attempts, total_time_sec, fast_wrong, hinted_attempts, hint_stage_sum, guess_annotations, careless_annotations, verified_evidence_days, last_answered_at'

/** Same numeric boundary for the map and the plan; absent evidence is not mastery. */
export function toMasteryStateInput(state: MasteryStateRow): MasteryStateRowInput {
  return {
    outcomeId: state.outcome_id,
    attempts: Number(state.attempts ?? 0),
    correctAttempts: Number(state.correct_attempts ?? 0),
    weightedEarned: Number(state.weighted_earned ?? 0),
    weightedPossible: Number(state.weighted_possible ?? 0),
    delayedCorrect: Number(state.delayed_correct ?? 0),
    v2Attempts: Number(state.v2_attempts ?? 0),
    difficultyWeightedEarned: Number(state.difficulty_weighted_earned ?? 0),
    difficultyWeightedPossible: Number(state.difficulty_weighted_possible ?? 0),
    timedAttempts: Number(state.timed_attempts ?? 0),
    totalTimeSec: Number(state.total_time_sec ?? 0),
    fastWrong: Number(state.fast_wrong ?? 0),
    hintedAttempts: Number(state.hinted_attempts ?? 0),
    hintStageSum: Number(state.hint_stage_sum ?? 0),
    guessAnnotations: Number(state.guess_annotations ?? 0),
    carelessAnnotations: Number(state.careless_annotations ?? 0),
    verifiedEvidenceDays: Number(state.verified_evidence_days ?? 0),
    lastAnsweredAt: state.last_answered_at,
  }
}

/** A scoped RPC must return its full contract; never replace it with legacy rows. */
export function isCompleteMasteryStateRow(value: unknown): value is MasteryStateRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return typeof row.outcome_id === 'string'
    && (row.last_answered_at === null || (
      typeof row.last_answered_at === 'string' && Number.isFinite(Date.parse(row.last_answered_at))
    ))
    && ['attempts', 'correct_attempts', 'weighted_earned', 'weighted_possible', 'delayed_correct', 'v2_attempts', 'difficulty_weighted_earned', 'difficulty_weighted_possible', 'timed_attempts', 'total_time_sec', 'fast_wrong', 'hinted_attempts', 'hint_stage_sum', 'guess_annotations', 'careless_annotations', 'verified_evidence_days']
      .every((field) => (typeof row[field] === 'number' || typeof row[field] === 'string')
        && String(row[field]).trim() !== ''
        && Number.isFinite(Number(row[field])) && Number(row[field]) >= 0)
}
