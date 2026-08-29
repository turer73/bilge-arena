import { describe, expect, it } from 'vitest'
import { estimateWorkerReliability, evaluateCommunityConsensus, type CommunityClaimEvidence } from '../consensus'

const trusted = { sensitivity: 0.95, specificity: 0.95, correctionAccuracy: 0.95, trusted: true }
const newWorker = { sensitivity: 0.60, specificity: 0.60, correctionAccuracy: 0.60, trusted: false }

function claim(index: number, overrides: Partial<CommunityClaimEvidence> = {}): CommunityClaimEvidence {
  return {
    userId: `user-${index}`,
    independenceKey: `cluster-${index}`,
    verdict: 'flawed',
    reasonCode: 'wrong_key',
    correctionFingerprint: 'a'.repeat(64),
    reliability: trusted,
    ...overrides,
  }
}

describe('community quality consensus', () => {
  it('does not let two models replace the five-user/three-trusted floor', () => {
    const result = evaluateCommunityConsensus({
      claims: [claim(1)],
      modelEvidence: [
        { direction: 'supports_flaw', strength: 1 },
        { direction: 'supports_flaw', strength: 1 },
      ],
      externalProof: 'deterministic',
      externalProofDirection: 'supports_flaw',
    })
    expect(result.decision).toBe('collecting')
    expect(result.needsMore).toBe(4)
  })

  it('quarantines a five-user exact correction without calling it confirmed', () => {
    const result = evaluateCommunityConsensus({ claims: [1, 2, 3, 4, 5].map((i) => claim(i)) })
    expect(result.decision).toBe('quarantine')
    expect(result.trustedAgreementCount).toBe(5)
  })

  it('requires independent proof before confirmation and reward eligibility', () => {
    const result = evaluateCommunityConsensus({
      claims: [1, 2, 3, 4, 5].map((i) => claim(i)),
      externalProof: 'official_source',
      externalProofDirection: 'supports_flaw',
    })
    expect(result.decision).toBe('confirmed')
  })

  it('never promotes model or web-research direction into independent proof', () => {
    const result = evaluateCommunityConsensus({
      claims: [1, 2, 3, 4, 5].map((i) => claim(i)),
      modelEvidence: [{ direction: 'supports_flaw', strength: 1 }],
      externalProof: 'none',
      externalProofDirection: 'supports_flaw',
    })
    expect(result.decision).toBe('quarantine')
  })

  it('does not count sybil-like claims from one risk cluster as independent', () => {
    const result = evaluateCommunityConsensus({
      claims: [1, 2, 3, 4, 5].map((i) => claim(i, { independenceKey: 'shared-cluster' })),
      externalProof: 'deterministic',
      externalProofDirection: 'supports_flaw',
    })
    expect(result.decision).toBe('collecting')
    expect(result.independentClusterCount).toBe(1)
  })

  it('does not trust new workers merely because they agree', () => {
    const result = evaluateCommunityConsensus({
      claims: [1, 2, 3, 4, 5].map((i) => claim(i, { reliability: newWorker })),
      externalProof: 'deterministic',
      externalProofDirection: 'supports_flaw',
    })
    expect(result.decision).toBe('collecting')
    expect(result.trustedAgreementCount).toBe(0)
  })

  it('keeps sensitivity and specificity separate in worker calibration', () => {
    const profile = estimateWorkerReliability({
      resolvedTotal: 24,
      flawedControls: 10,
      flawedControlsCorrect: 9,
      cleanControls: 10,
      cleanControlsCorrect: 10,
      correctionChecks: 8,
      correctionChecksCorrect: 7,
    })
    expect(profile.trusted).toBe(true)
    expect(profile.specificity).toBeGreaterThan(profile.sensitivity)
  })
})
