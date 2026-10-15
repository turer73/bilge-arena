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

describe('community-quality@2 model gate', () => {
  // 0.82 reliability puts five trusted reporters at ~6.22 human log-odds:
  // below the quarantine threshold alone (0.911), above it with the full
  // +2.2 model term (0.989). The model term is then the only reason to act.
  const borderline = { sensitivity: 0.82, specificity: 0.82, correctionAccuracy: 0.82, trusted: true }
  const borderlineClaims = () => [1, 2, 3, 4, 5].map((i) => claim(i, { reliability: borderline }))
  const modelSupportsFlaw = [{ direction: 'supports_flaw' as const, strength: 1 }]

  it('withholds a quarantine the model term alone would have carried', () => {
    const result = evaluateCommunityConsensus({ claims: borderlineClaims(), modelEvidence: modelSupportsFlaw })
    expect(result.posteriorDefectProbability).toBeGreaterThanOrEqual(0.98)
    expect(result.posteriorWithoutModel).toBeLessThan(0.98)
    expect(result.ungatedDecision).toBe('quarantine')
    expect(result.decision).toBe('suspected')
    expect(result.modelGate).toBe('held_for_human_review')
  })

  it('never lifts a quarantine already taken under the ungated rule', () => {
    const result = evaluateCommunityConsensus({
      claims: borderlineClaims(), modelEvidence: modelSupportsFlaw, previousState: 'quarantined',
    })
    expect(result.decision).toBe('quarantine')
    expect(result.modelGate).toBe('retained_existing_action')
  })

  it('never reopens a confirmation already taken under the ungated rule', () => {
    // With +4.6 external proof, ~2.96 human log-odds confirms only with the
    // model term (0.997) and falls short without it (0.975).
    const proofBorderline = { sensitivity: 0.75, specificity: 0.75, correctionAccuracy: 0.75, trusted: true }
    const input = {
      claims: [1, 2, 3].map((i) => claim(i, { reliability: proofBorderline }))
        .concat([4, 5].map((i) => claim(i, { reliability: newWorker }))),
      modelEvidence: modelSupportsFlaw,
      externalProof: 'deterministic' as const,
      externalProofDirection: 'supports_flaw' as const,
    }
    const fresh = evaluateCommunityConsensus(input)
    expect(fresh.ungatedDecision).toBe('confirmed')
    expect(fresh.decision).toBe('suspected')
    expect(fresh.modelGate).toBe('held_for_human_review')
    const retained = evaluateCommunityConsensus({ ...input, previousState: 'confirmed' })
    expect(retained.decision).toBe('confirmed')
    expect(retained.modelGate).toBe('retained_existing_action')
  })

  it('withholds a rejection the model term alone would have carried', () => {
    const weakClean = { sensitivity: 0.6, specificity: 0.6, correctionAccuracy: 0.6, trusted: true }
    const weakFlaw = { sensitivity: 0.75, specificity: 0.75, correctionAccuracy: 0.75, trusted: true }
    const result = evaluateCommunityConsensus({
      claims: [
        ...[1, 2, 3].map((i) => claim(i, { verdict: 'clean', reasonCode: null, correctionFingerprint: null, reliability: weakClean })),
        ...[4, 5].map((i) => claim(i, { reliability: weakFlaw })),
      ],
      modelEvidence: [{ direction: 'supports_clean', strength: 1 }],
    })
    expect(result.posteriorDefectProbability).toBeLessThanOrEqual(0.02)
    expect(result.posteriorWithoutModel).toBeGreaterThan(0.02)
    expect(result.ungatedDecision).toBe('rejected')
    expect(result.decision).toBe('collecting')
    expect(result.modelGate).toBe('held_for_human_review')
  })

  it('still lets a contrary model verdict withhold a human-only quarantine', () => {
    const strong = { sensitivity: 0.87, specificity: 0.87, correctionAccuracy: 0.87, trusted: true }
    const result = evaluateCommunityConsensus({
      claims: [1, 2, 3, 4, 5].map((i) => claim(i, { reliability: strong })),
      modelEvidence: [{ direction: 'supports_clean', strength: 1 }],
    })
    expect(result.posteriorWithoutModel).toBeGreaterThanOrEqual(0.98)
    expect(result.decision).toBe('suspected')
  })

  it('retains a human-only quarantine when contrary model evidence lowers both rules (Codex #523 P1)', () => {
    // Five strong reporters quarantine on their own (posterior without model >= 0.98).
    // A later supports_clean verification pulls the full posterior below 0.98, so
    // the ungated rule AND the gated rule both say 'suspected'. The case must not
    // be lifted automatically, and the caller must not have to catch a regression.
    const strong = { sensitivity: 0.87, specificity: 0.87, correctionAccuracy: 0.87, trusted: true }
    const result = evaluateCommunityConsensus({
      claims: [1, 2, 3, 4, 5].map((i) => claim(i, { reliability: strong })),
      modelEvidence: [{ direction: 'supports_clean', strength: 1 }],
      previousState: 'quarantined',
    })
    expect(result.posteriorWithoutModel).toBeGreaterThanOrEqual(0.98)
    expect(result.ungatedDecision).toBe('suspected')
    expect(result.decision).toBe('quarantine')
    expect(result.modelGate).toBe('retained_existing_action')
  })

  it('keeps a confirmed case confirmed even when the ungated rule no longer confirms it', () => {
    // Confirmation needs external proof; with the proof gone the ungated rule
    // drops to quarantine or lower. Confirmed is terminal for automation.
    const result = evaluateCommunityConsensus({
      claims: [1, 2, 3, 4, 5].map((i) => claim(i)),
      externalProof: 'none',
      previousState: 'confirmed',
    })
    expect(result.ungatedDecision).not.toBe('confirmed')
    expect(result.decision).toBe('confirmed')
    expect(result.modelGate).toBe('retained_existing_action')
  })

  it('leaves human-only decisions untouched and unlabelled', () => {
    const result = evaluateCommunityConsensus({ claims: [1, 2, 3, 4, 5].map((i) => claim(i)) })
    expect(result.decision).toBe('quarantine')
    expect(result.ungatedDecision).toBe('quarantine')
    expect(result.modelGate).toBeNull()
    expect(result.posteriorWithoutModel).toBe(result.posteriorDefectProbability)
  })
})
