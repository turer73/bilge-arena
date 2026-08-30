import { describe, expect, it } from 'vitest'
import { buildMasteryDiscovery } from '../discovery'

describe('buildMasteryDiscovery', () => {
  it('kanıtı cevap sayısından değil ayrı doğrulanmış Türkiye günlerinden toplar', () => {
    expect(buildMasteryDiscovery([
      { verifiedEvidenceDays: 1 },
      { verifiedEvidenceDays: 4 },
    ], false)).toEqual({
      level: 2,
      stage: 'evidence',
      diagnosticCompleted: false,
      evidenceCollected: 4,
      evidenceTarget: 6,
      readyOutcomes: 1,
      totalOutcomes: 2,
      journeyPercentage: 67,
    })
  })

  it('her outcome üç ayrı güne ulaşmadan hazır aşamasına geçmez', () => {
    expect(buildMasteryDiscovery([
      { verifiedEvidenceDays: 3 },
      { verifiedEvidenceDays: 2 },
    ], true)).toMatchObject({
      level: 2,
      stage: 'evidence',
      readyOutcomes: 1,
      evidenceCollected: 5,
    })
    expect(buildMasteryDiscovery([
      { verifiedEvidenceDays: 3 },
      { verifiedEvidenceDays: 3 },
    ], true)).toMatchObject({
      level: 3,
      stage: 'ready',
      readyOutcomes: 2,
      journeyPercentage: 100,
    })
  })
})
