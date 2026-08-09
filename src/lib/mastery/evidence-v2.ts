import type { MasteryStatus } from './status'

export interface MasteryEvidenceV2Input {
  attempts: number
  correctAttempts: number
  weightedEarned: number
  weightedPossible: number
  delayedCorrect: number
  v2Attempts: number
  difficultyWeightedEarned: number
  difficultyWeightedPossible: number
  timedAttempts: number
  totalTimeSec: number
  fastWrong: number
  hintedAttempts: number
  hintStageSum: number
  guessAnnotations: number
  carelessAnnotations: number
}

export interface MasteryEvidenceV2Summary {
  attempts: number
  correctAttempts: number
  delayedCorrect: number
  rawAccuracy: number
  difficultyAccuracy: number
  averageTimeSec: number | null
  fastWrongRate: number
  hintRate: number
  averageHintStage: number | null
  guessRisk: number
  carelessRisk: number
  evidenceCompleteness: number
  score: number
  status: MasteryStatus
  modelVersion: 'legacy-v1' | 'evidence-v2'
  components: {
    accuracy: number
    delayedRetrieval: number
    independence: number
    selfRegulation: number
  }
}
function whole(value: number, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(max, Math.max(0, Math.trunc(value)))
}

function amount(value: number, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(max, Math.max(0, value))
}

function percent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return Math.round(Math.min(1, Math.max(0, numerator / denominator)) * 100)
}

/**
 * Açıklanabilir V2 kanıt özeti. Ortalama süre görünür kalır fakat soru-bazlı
 * norm olmadığı için skoru tek başına yükseltmez veya düşürmez.
 */
export function summarizeMasteryEvidenceV2(input: MasteryEvidenceV2Input): MasteryEvidenceV2Summary {
  const attempts = whole(input.attempts)
  const correctAttempts = whole(input.correctAttempts, attempts)
  const wrongAttempts = Math.max(0, attempts - correctAttempts)
  const weightedPossible = amount(input.weightedPossible)
  const weightedEarned = amount(input.weightedEarned, weightedPossible)
  const delayedCorrect = whole(input.delayedCorrect, correctAttempts)
  const v2Attempts = whole(input.v2Attempts, attempts)
  const difficultyPossible = amount(input.difficultyWeightedPossible)
  const difficultyEarned = amount(input.difficultyWeightedEarned, difficultyPossible)
  const timedAttempts = whole(input.timedAttempts, v2Attempts)
  const totalTimeSec = amount(input.totalTimeSec)
  const fastWrong = whole(input.fastWrong, wrongAttempts)
  const hintedAttempts = whole(input.hintedAttempts, v2Attempts)
  const hintStageSum = amount(input.hintStageSum, hintedAttempts * 4)
  const guessAnnotations = whole(input.guessAnnotations, wrongAttempts)
  const carelessAnnotations = whole(input.carelessAnnotations, wrongAttempts)

  const rawAccuracy = percent(weightedEarned, weightedPossible)
  const difficultyAccuracy = difficultyPossible > 0
    ? percent(difficultyEarned, difficultyPossible)
    : rawAccuracy
  const v2Coverage = attempts > 0 ? v2Attempts / attempts : 0
  const blendedAccuracy = Math.round(
    rawAccuracy * (1 - v2Coverage) + difficultyAccuracy * v2Coverage,
  )
  const averageTimeSec = timedAttempts > 0
    ? Math.round((totalTimeSec / timedAttempts) * 10) / 10
    : null
  const fastWrongRate = percent(fastWrong, wrongAttempts)
  const hintRate = percent(hintedAttempts, v2Attempts)
  const averageHintStage = hintedAttempts > 0
    ? Math.round((hintStageSum / hintedAttempts) * 10) / 10
    : null
  const normalizedHintDepth = averageHintStage === null ? 0 : averageHintStage / 4
  const hintDependency = v2Attempts > 0
    ? (hintedAttempts / v2Attempts) * (0.5 + 0.5 * normalizedHintDepth)
    : 0
  const independence = Math.round(100 * (1 - Math.min(1, hintDependency)))
  const guessRisk = percent(guessAnnotations, wrongAttempts)
  const carelessRisk = percent(carelessAnnotations, wrongAttempts)
  const selfReportedRisk = Math.min(100, guessRisk + carelessRisk)
  const combinedRisk = Math.min(100, Math.round(fastWrongRate * 0.6 + selfReportedRisk * 0.4))
  const selfRegulation = 100 - combinedRisk
  const delayedRetrieval = delayedCorrect > 0 ? 100 : 0

  const components = {
    accuracy: Math.round(blendedAccuracy * 0.55),
    delayedRetrieval: Math.round(delayedRetrieval * 0.20),
    independence: Math.round(independence * 0.15),
    selfRegulation: Math.round(selfRegulation * 0.10),
  }
  const score = Math.min(100, Object.values(components).reduce((sum, value) => sum + value, 0))
  const evidenceCompleteness = Math.round(100 * (
    Math.min(1, attempts / 5) * 0.5 + v2Coverage * 0.5
  ))

  let status: MasteryStatus = 'developing'
  if (attempts < 3) status = 'insufficient'
  else if (
    attempts >= 5
    && delayedCorrect >= 1
    && (v2Attempts > 0 ? score >= 80 && independence >= 50 : rawAccuracy >= 80)
  ) status = 'mastered'

  return {
    attempts,
    correctAttempts,
    delayedCorrect,
    rawAccuracy,
    difficultyAccuracy,
    averageTimeSec,
    fastWrongRate,
    hintRate,
    averageHintStage,
    guessRisk,
    carelessRisk,
    evidenceCompleteness,
    score: v2Attempts > 0 ? score : rawAccuracy,
    status,
    modelVersion: v2Attempts > 0 ? 'evidence-v2' : 'legacy-v1',
    components: v2Attempts > 0
      ? components
      : { accuracy: rawAccuracy, delayedRetrieval: 0, independence: 0, selfRegulation: 0 },
  }
}
