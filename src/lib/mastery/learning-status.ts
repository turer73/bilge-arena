import { summarizeMasteryEvidenceV2, type MasteryEvidenceV2Input } from './evidence-v2'

export interface LearningStatusInput extends MasteryEvidenceV2Input {
  verifiedEvidenceDays: number
}

/** One decision for the map and outcome-based daily-plan targeting. */
export function summarizeLearningStatus(input: LearningStatusInput) {
  const summary = summarizeMasteryEvidenceV2(input)
  const days = Number(input.verifiedEvidenceDays)
  const verifiedEvidenceDays = Number.isSafeInteger(days) && days >= 0 && days <= summary.attempts
    ? days
    : 0
  // Three distinct Istanbul dates are a minimum evidence gate, not proof of
  // a minimum elapsed interval or of psychometric validity.
  return {
    ...summary,
    ...(verifiedEvidenceDays >= 3 ? {} : {
      evidenceCompleteness: Math.round((verifiedEvidenceDays / 3) * 100),
      score: 0,
      status: 'insufficient' as const,
      components: { accuracy: 0, delayedRetrieval: 0, independence: 0, selfRegulation: 0 },
    }),
    verifiedEvidenceDays,
  }
}
