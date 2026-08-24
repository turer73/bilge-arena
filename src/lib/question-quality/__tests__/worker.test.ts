import { describe, expect, it } from 'vitest'

import { evaluateCaseEvidence } from '../worker'

describe('evaluateCaseEvidence', () => {
  it('keeps authoritative-host research capped and never turns it into proof', () => {
    const profile = {
      resolvedTotal: 40,
      flawedControls: 20,
      flawedControlsCorrect: 20,
      cleanControls: 20,
      cleanControlsCorrect: 20,
      correctionChecks: 20,
      correctionChecksCorrect: 20,
    }
    const result = evaluateCaseEvidence({
      case: { caseId: 'case-1' },
      claims: [1, 2, 3, 4, 5].map((index) => ({
        userId: `user-${index}`,
        independenceKey: `cluster-${index}`,
        verdict: 'flawed' as const,
        reasonCode: 'wrong_key',
        correctionFingerprint: 'a'.repeat(64),
        profile,
      })),
      verifications: [{
        role: 'research', status: 'ok', direction: 'supports_flaw', strength: 1,
        sources: [{ authoritative: true }],
      }],
    })

    expect(result.externalProof).toBe('none')
    expect(result.decision).toBe('quarantine')
  })
})
