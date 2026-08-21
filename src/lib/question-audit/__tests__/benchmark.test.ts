import { describe, expect, it } from 'vitest'
import { evaluateBenchmark, type GoldLabel, type PromotionPolicy } from '../benchmark'
import type { CalibrationItem } from '../calibration'
import type { Finding, Verdict } from '../types'

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
    reviewerCount: 2,
    adjudication: 'consensus',
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

  it('tek-reviewer etiketi altin standart diye kabul etmez', () => {
    const bad = { ...label('a', []), reviewerCount: 1 }
    expect(() => evaluateBenchmark([bad], [item('a', 'APPROVED')], 0, permissive)).toThrow('en az iki reviewer')
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
