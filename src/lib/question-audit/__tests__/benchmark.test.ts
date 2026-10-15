import { describe, expect, it } from 'vitest'
import {
  assertPromotionEvidence as assertPromotionWithScope,
  DEFAULT_PROMOTION_POLICY,
  evaluateBenchmark,
  type GoldLabel,
  type PromotionEvidence,
  type PromotionPolicy,
} from '../benchmark'
import type { CalibrationItem } from '../calibration'
import type { AuditExecutionIdentity, Finding, Verdict } from '../types'
import type { PromotionContext, PromotionScope } from '../promotion-scope'

const scope: PromotionScope = {
  schemaVersion: 'promotion-scope@1', kind: 'bounded_cohort', game: 'turkce', examRef: 'LGS',
  controlSetSha256: 'c'.repeat(64),
  targets: [{ questionId: '11111111-1111-4111-8111-111111111111', revisionId: '22222222-2222-4222-8222-222222222222', contentSha256: 'd'.repeat(64) }],
}
const context: PromotionContext = {
  controlSetSha256: scope.controlSetSha256,
  targets: scope.targets.map(t => ({ ...t, game: scope.game, examRef: scope.examRef })),
}
const assertPromotionEvidence = (evidence: unknown, runIdentity: AuditExecutionIdentity) =>
  assertPromotionWithScope(evidence, runIdentity, context)

const permissive: PromotionPolicy = {
  minLabels: 2,
  minPositiveLabels: 1,
  minNegativeLabels: 1,
  minCoverage: 1,
  maxTransportFailureRate: 0.05,
  minBalancedAccuracy: 0.8,
  maxFalsePositiveRateUpper95: 1,
  maxFalseNegativeRateUpper95: 1,
  minExactFlawMatchRate: 0.75,
}

function item(id: string, verdict: Verdict, findings: Finding[] = []): CalibrationItem {
  return {
    questionId: id,
    contentSha256: id.repeat(64).slice(0, 64),
    category: 'matematik',
    verdict,
    markedAnswerIndex: 2,
    blindConsensusIndex: 2,
    blindAgreementRatio: 1,
    findings,
    rationale: 'test',
    failedCalls: 0,
    totalCalls: 5,
    latencyMs: 10,
    inputTokens: 10,
    outputTokens: 5,
    cached: false,
  }
}

function label(id: string, flawCodes: GoldLabel['flawCodes']): GoldLabel {
  return {
    questionId: id,
    contentSha256: id.repeat(64).slice(0, 64),
    flawCodes,
    evidenceClass: 'curator_adjudicated',
    proofRef: 'f'.repeat(64),
    reviewerCount: 2,
    adjudication: 'consensus',
    reviewerRefs: ['a'.repeat(64), 'b'.repeat(64)],
  }
}

const identity: AuditExecutionIdentity = {
  policyVersion: 'question-quality@2',
  generationConfig: {
    blindSamples: 3,
    blindTemperature: 0.7,
    adversarialTemperature: 0.2,
    verifierTemperature: 0,
    maxOutputTokens: { blind: 2048, adversarial: 2048, verifier: 1536 },
  },
  generationConfigSha256: 'a'.repeat(64),
  providerIds: { blind: 'gemini:x', adversarial: 'gemini:x', verifier: 'gemini:x' },
  modelIds: { blind: 'x', adversarial: 'x', verifier: 'x' },
  promptVersions: { blind: 'blind-solver@2', adversarial: 'adversarial@2', verifier: 'solution-verifier@3' },
}

function promotionEvidence(): PromotionEvidence {
  return {
    scope,
    subject: {
      policyVersion: identity.policyVersion,
      providerIds: identity.providerIds,
      modelIds: identity.modelIds,
      promptVersions: identity.promptVersions,
      config: {
        ...identity.generationConfig,
        timeoutMs: 60_000,
        maxAttempts: 3,
      },
    },
    benchmark: { promotion: { passed: true, policy: DEFAULT_PROMOTION_POLICY } },
  }
}

describe('insan-altin benchmark', () => {
  it('confusion matrix ve tam kusur eslesmesini hesaplar', () => {
    const report = evaluateBenchmark(
      [label('a', []), label('b', ['WRONG_KEY_SUSPECTED'])],
      [item('a', 'APPROVED'), item('b', 'REJECTED', [{ code: 'WRONG_KEY_SUSPECTED', evidence: 'anahtar farkli' }])],
      0,
      permissive,
    )
    expect(report.overall).toMatchObject({ truePositive: 1, trueNegative: 1, falsePositive: 0, falseNegative: 0, balancedAccuracy: 1 })
    expect(report.exactFlawMatchRate).toBe(1)
    expect(report.promotion.passed).toBe(true)
  })

  it('yanlis pozitif ve yanlis negatifi ayri gosterir', () => {
    const report = evaluateBenchmark(
      [label('a', []), label('b', ['MISSING_PREMISE'])],
      [
        item('a', 'NEEDS_REVIEW', [{ code: 'AMBIGUOUS_WORDING', evidence: 'yanlis alarm' }]),
        item('b', 'APPROVED'),
      ],
      0,
      permissive,
    )
    expect(report.overall).toMatchObject({ falsePositive: 1, falseNegative: 1, falsePositiveRate: 1, falseNegativeRate: 1 })
    expect(report.promotion.passed).toBe(false)
  })

  it('INCONCLUSIVE sonucu dogruluk gibi saymaz ve coverage kapisini dusurur', () => {
    const report = evaluateBenchmark(
      [label('a', []), label('b', ['WRONG_KEY_SUSPECTED'])],
      [item('a', 'APPROVED'), item('b', 'INCONCLUSIVE')],
      0.2,
      permissive,
    )
    expect(report).toMatchObject({ matchedCount: 2, evaluatedCount: 1, inconclusiveCount: 1, coverage: 0.5 })
    expect(report.promotion.failures.join(' ')).toContain('coverage')
    expect(report.promotion.failures.join(' ')).toContain('transport_failure_rate')
  })

  it('hash eslesmeyen revizyonu benchmarka baglamaz', () => {
    const changed = item('a', 'APPROVED')
    changed.contentSha256 = 'f'.repeat(64)
    const report = evaluateBenchmark([label('a', [])], [changed], 0, { ...permissive, minLabels: 1, minPositiveLabels: 0 })
    expect(report).toMatchObject({ matchedCount: 0, evaluatedCount: 0, coverage: 0 })
    expect(report.promotion.passed).toBe(false)
  })

  it('hex hash buyuk-kucuk harf farkini revizyon farki saymaz', () => {
    const gold = { ...label('a', []), contentSha256: 'A'.repeat(64) }
    const report = evaluateBenchmark([gold], [item('a', 'APPROVED')], 0, { ...permissive, minLabels: 1, minPositiveLabels: 0 })
    expect(report).toMatchObject({ matchedCount: 1, evaluatedCount: 1, coverage: 1 })
  })

  it('tek-reviewer etiketi altin standart diye kabul etmez', () => {
    const bad = { ...label('a', []), reviewerCount: 1, reviewerRefs: ['a'.repeat(64)] }
    expect(() => evaluateBenchmark([bad], [item('a', 'APPROVED')], 0, permissive)).toThrow('consensus tam iki reviewer')
  })

  it('yinelenen anonim reviewer referansini bagimsiz uzman saymaz', () => {
    const bad = { ...label('a', []), reviewerRefs: ['a'.repeat(64), 'A'.repeat(64)] }
    expect(() => evaluateBenchmark([bad], [item('a', 'APPROVED')], 0, permissive)).toThrow('farkli ve anonim')
  })

  it('adjudicated etikette tam iki reviewer ve bir adjudicator ister', () => {
    const bad = {
      ...label('a', []),
      reviewerCount: 4,
      adjudication: 'adjudicated' as const,
      reviewerRefs: ['a', 'b', 'c', 'd'].map((ref) => ref.repeat(64)),
    }
    expect(() => evaluateBenchmark([bad], [item('a', 'APPROVED')], 0, permissive)).toThrow('tam uc reviewer')
  })

  it('ayni sorunun iki revizyonuyla orneklem sayisini sisirmeyi reddeder', () => {
    const second = { ...label('a', []), contentSha256: 'f'.repeat(64) }
    expect(() => evaluateBenchmark([label('a', []), second], [item('a', 'APPROVED')], 0, permissive)).toThrow('birden fazla revizyon')
  })

  it('varsayilan kapida kucuk sentetik orneklemi terfi ettirmez', () => {
    const report = evaluateBenchmark(
      [label('a', []), label('b', ['WRONG_KEY_SUSPECTED'])],
      [item('a', 'APPROVED'), item('b', 'REJECTED', [{ code: 'WRONG_KEY_SUSPECTED', evidence: 'x' }])],
      0,
    )
    expect(report.promotion.passed).toBe(false)
    expect(report.promotion.failures[0]).toContain('label_count')
  })
})

describe('terfi kaniti kimlik bagi', () => {
  const bounded = (ids: unknown[], conditions: unknown = ['clean', 'wrong', 'incomplete']) => ({
    ...promotionEvidence(), extraReleaseConditionsPassed: true,
    boundedScope: { releaseConditions: conditions },
    checks: ids.map((conditionId) => ({ conditionId, passed: true })),
  })
  it('requires exact coverage of every declared release condition', () => {
    expect(() => assertPromotionEvidence(bounded(['wrong', 'clean', 'incomplete']), identity)).not.toThrow()
  })
  it.each([['clean'], ['clean', 'wrong'], ['clean', 'wrong', 'wrong'], ['clean', 'wrong', 'other'],
    ['clean', 'wrong', 'incomplete', 'extra'], [undefined, undefined, undefined]])('rejects missing/duplicate/unknown conditions %j', (...ids) => {
    expect(() => assertPromotionEvidence(bounded(ids), identity)).toThrow('ek kosul')
  })
  it.each([[], ['clean', 'clean'], [''], null])('rejects malformed declared conditions %j', (conditions) => {
    expect(() => assertPromotionEvidence(bounded(['clean'], conditions), identity)).toThrow('ek kosul')
  })
  it.each([false, null, 'true', 1, undefined])('beyan edilmis ek kosul %j ise varsayilan yesil olsa da reddeder', (extra) => {
    const evidence = { ...promotionEvidence(), extraReleaseConditionsPassed: extra }
    expect(() => assertPromotionEvidence(evidence, identity)).toThrow('ek')
  })

  it('ek bayrak silinmis ama kosullar beyan edilmisse kabul etmez', () => {
    const evidence = { ...promotionEvidence(), boundedScope: { releaseConditions: ['all controls'] } }
    expect(() => assertPromotionEvidence(evidence, identity)).toThrow('ek')
  })

  it('ek bayrak yesil olsa bile tekil kontrol basarisizsa reddeder', () => {
    const evidence = { ...promotionEvidence(), extraReleaseConditionsPassed: true, checks: [{ passed: false }] }
    expect(() => assertPromotionEvidence(evidence, identity)).toThrow('ek')
  })

  it('butun acik ek kontroller gectiyse diger kimlik kapilari korunur', () => {
    const evidence = { ...promotionEvidence(), extraReleaseConditionsPassed: true, checks: [{ passed: true }] }
    expect(() => assertPromotionEvidence(evidence, identity)).not.toThrow()
  })

  it.each([undefined, [], null, [{ passed: 'true' }], [null], [true]])('ek onay tek basina yeterli degil: %j', (checks) => {
    expect(() => assertPromotionEvidence({ ...promotionEvidence(), extraReleaseConditionsPassed: true, checks }, identity)).toThrow('ek kontrol')
  })

  it('ayni policy/provider/model/prompt/ayar raporunu kabul eder', () => {
    expect(() => assertPromotionEvidence(promotionEvidence(), identity)).not.toThrow()
  })

  it('baska prompt surumunun raporunu reddeder', () => {
    const evidence = promotionEvidence()
    evidence.subject.promptVersions = { ...evidence.subject.promptVersions, blind: 'blind-solver@1' }
    expect(() => assertPromotionEvidence(evidence, identity)).toThrow('promptVersions')
  })

  it('gevsetilmis benchmark esigini reddeder', () => {
    const evidence = promotionEvidence()
    evidence.benchmark.promotion.policy = { ...DEFAULT_PROMOTION_POLICY, minLabels: 2 }
    expect(() => assertPromotionEvidence(evidence, identity)).toThrow('varsayilan guvence')
  })
})
