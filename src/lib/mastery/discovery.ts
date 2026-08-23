import type { MasteryOutcomePublic } from './public-contract'

export type MasteryDiscoveryStage = 'estimate' | 'evidence' | 'ready'

export interface MasteryDiscoveryPublic {
  level: 1 | 2 | 3
  stage: MasteryDiscoveryStage
  diagnosticCompleted: boolean
  evidenceCollected: number
  evidenceTarget: number
  readyOutcomes: number
  totalOutcomes: number
  journeyPercentage: number
}

/**
 * Cold-start ilerlemesini başarı tahminiyle karıştırmadan oyunlaştırır.
 * Tanılama yalnız başlangıç tahminidir; kalıcı harita için her kazanımda
 * üç doğrulanmış kanıt gerekir.
 */
export function buildMasteryDiscovery(
  outcomes: MasteryOutcomePublic[],
  diagnosticCompleted: boolean,
): MasteryDiscoveryPublic | null {
  if (outcomes.length === 0) return null

  const totalOutcomes = outcomes.length
  const evidenceTarget = totalOutcomes * 3
  const evidenceCollected = outcomes.reduce(
    (sum, outcome) => sum + Math.min(3, Math.max(0, outcome.attempts)),
    0,
  )
  const readyOutcomes = outcomes.filter((outcome) => outcome.status !== 'insufficient').length
  const ready = readyOutcomes === totalOutcomes
  const stage: MasteryDiscoveryStage = ready
    ? 'ready'
    : diagnosticCompleted || evidenceCollected > 0
      ? 'evidence'
      : 'estimate'
  const level = stage === 'ready' ? 3 : stage === 'evidence' ? 2 : 1
  const evidenceRatio = evidenceTarget > 0 ? evidenceCollected / evidenceTarget : 0
  const journeyPercentage = ready
    ? 100
    : diagnosticCompleted
      ? Math.min(99, 25 + Math.round(evidenceRatio * 75))
      : Math.min(99, Math.round(evidenceRatio * 100))

  return {
    level,
    stage,
    diagnosticCompleted,
    evidenceCollected,
    evidenceTarget,
    readyOutcomes,
    totalOutcomes,
    journeyPercentage,
  }
}
