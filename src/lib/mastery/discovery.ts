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
 * üç ayrı Europe/Istanbul takvim gününe yayılan doğrulanmış kanıt gerekir.
 */
export function buildMasteryDiscovery(
  outcomes: Pick<MasteryOutcomePublic, 'verifiedEvidenceDays'>[],
  diagnosticCompleted: boolean,
): MasteryDiscoveryPublic | null {
  if (outcomes.length === 0) return null

  const totalOutcomes = outcomes.length
  const evidenceTarget = totalOutcomes * 3
  const evidenceDays = outcomes.map((outcome) => (
    Number.isSafeInteger(outcome.verifiedEvidenceDays) && outcome.verifiedEvidenceDays >= 0
      ? outcome.verifiedEvidenceDays
      : 0
  ))
  const evidenceCollected = evidenceDays.reduce(
    (sum, days) => sum + Math.min(3, days),
    0,
  )
  const readyOutcomes = evidenceDays.filter((days) => days >= 3).length
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
