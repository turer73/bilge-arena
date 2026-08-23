/**
 * İnsan-adjudikasyonlu altın küme karşısında denetim hattını ölçer.
 *
 * Bu dosya soru bankasını değil, LLM hakemini değerlendirir. Modelin mevcut
 * cevap anahtarıyla mutabakatı bir altın standart değildir: banka ve model aynı
 * anda hatalı olabilir. Terfi kararı yalnız iki bağımsız uzmanın uzlaştığı veya
 * bir üçüncü uzmanın adjudike ettiği, içerik hash'ine bağlı etiketlerle verilir.
 */

import { FLAW_SEVERITY, type AuditExecutionIdentity, type FlawCode, type Verdict } from './types'
import type { CalibrationItem } from './calibration'

const FLAW_CODES = Object.keys(FLAW_SEVERITY) as FlawCode[]

export interface GoldLabel {
  questionId: string
  contentSha256: string
  /** Nihai insan bulguları. Boş dizi = bilinen kusur sınıflarından temiz. */
  flawCodes: FlawCode[]
  /** En az iki bağımsız uzman veya anlaşmazlık halinde adjudikatör. */
  reviewerCount: number
  adjudication: 'consensus' | 'adjudicated'
  /** Kimlik taşımayan, 64 hex karakterli farklı uzman referansları. */
  reviewerRefs: string[]
}

export interface BinaryMetrics {
  truePositive: number
  falsePositive: number
  trueNegative: number
  falseNegative: number
  positiveSupport: number
  negativeSupport: number
  sensitivity: number | null
  specificity: number | null
  balancedAccuracy: number | null
  precision: number | null
  falsePositiveRate: number | null
  falseNegativeRate: number | null
  /** %95 Wilson sınırları; küçük örneklemde sahte kesinliği engeller. */
  sensitivityLower95: number | null
  specificityLower95: number | null
  falsePositiveRateUpper95: number | null
  falseNegativeRateUpper95: number | null
}

export interface PromotionPolicy {
  minLabels: number
  minPositiveLabels: number
  minNegativeLabels: number
  minCoverage: number
  maxTransportFailureRate: number
  minBalancedAccuracy: number
  maxFalsePositiveRateUpper95: number
  maxFalseNegativeRateUpper95: number
  minExactFlawMatchRate: number
}

export const DEFAULT_PROMOTION_POLICY: PromotionPolicy = {
  minLabels: 100,
  minPositiveLabels: 20,
  minNegativeLabels: 50,
  minCoverage: 0.95,
  maxTransportFailureRate: 0.05,
  minBalancedAccuracy: 0.8,
  maxFalsePositiveRateUpper95: 0.1,
  maxFalseNegativeRateUpper95: 0.15,
  minExactFlawMatchRate: 0.75,
}

export interface BenchmarkReport {
  labelCount: number
  matchedCount: number
  evaluatedCount: number
  inconclusiveCount: number
  coverage: number
  exactFlawMatchRate: number | null
  overall: BinaryMetrics
  byFlaw: Record<FlawCode, BinaryMetrics>
  promotion: {
    passed: boolean
    policy: PromotionPolicy
    failures: string[]
  }
}

export interface PromotionEvidence {
  subject: {
    policyVersion: string
    providerIds: AuditExecutionIdentity['providerIds']
    modelIds: AuditExecutionIdentity['modelIds']
    promptVersions: AuditExecutionIdentity['promptVersions']
    config: Record<string, unknown>
  }
  benchmark: {
    promotion: {
      passed: boolean
      policy: PromotionPolicy
    }
  }
}

interface Pair {
  label: GoldLabel
  item: CalibrationItem
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null
}

/** Wilson score aralığı, z=1.96. */
function wilson(successes: number, total: number): { low: number | null; high: number | null } {
  if (total <= 0) return { low: null, high: null }
  const z = 1.96
  const z2 = z * z
  const p = successes / total
  const denominator = 1 + z2 / total
  const center = (p + z2 / (2 * total)) / denominator
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) / denominator
  return { low: Math.max(0, center - margin), high: Math.min(1, center + margin) }
}

function metrics(expected: readonly boolean[], actual: readonly boolean[]): BinaryMetrics {
  let truePositive = 0
  let falsePositive = 0
  let trueNegative = 0
  let falseNegative = 0
  for (let i = 0; i < expected.length; i++) {
    if (expected[i] && actual[i]) truePositive++
    else if (!expected[i] && actual[i]) falsePositive++
    else if (!expected[i] && !actual[i]) trueNegative++
    else falseNegative++
  }
  const positiveSupport = truePositive + falseNegative
  const negativeSupport = trueNegative + falsePositive
  const sensitivity = ratio(truePositive, positiveSupport)
  const specificity = ratio(trueNegative, negativeSupport)
  const sensitivityBounds = wilson(truePositive, positiveSupport)
  const specificityBounds = wilson(trueNegative, negativeSupport)
  const falsePositiveBounds = wilson(falsePositive, negativeSupport)
  const falseNegativeBounds = wilson(falseNegative, positiveSupport)
  return {
    truePositive,
    falsePositive,
    trueNegative,
    falseNegative,
    positiveSupport,
    negativeSupport,
    sensitivity,
    specificity,
    balancedAccuracy: sensitivity === null || specificity === null ? null : (sensitivity + specificity) / 2,
    precision: ratio(truePositive, truePositive + falsePositive),
    falsePositiveRate: ratio(falsePositive, negativeSupport),
    falseNegativeRate: ratio(falseNegative, positiveSupport),
    sensitivityLower95: sensitivityBounds.low,
    specificityLower95: specificityBounds.low,
    falsePositiveRateUpper95: falsePositiveBounds.high,
    falseNegativeRateUpper95: falseNegativeBounds.high,
  }
}

function uniqueCodes(codes: readonly FlawCode[]): FlawCode[] {
  return [...new Set(codes)].sort()
}

function canonicalJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize)
    if (input && typeof input === 'object') {
      const valueRecord = input as Record<string, unknown>
      return Object.fromEntries(Object.keys(valueRecord).sort().map((key) => [key, normalize(valueRecord[key])]))
    }
    return input
  }
  return JSON.stringify(normalize(value))
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('terfi kaniti gecersiz')
  }
  return value as Record<string, unknown>
}

/**
 * Yetkili karar yazmadan ONCE, insan-altin benchmark kanitinin kosulacak
 * provider/model/prompt/ayar kimligiyle birebir ayni oldugunu kanitlar.
 * Yalniz `passed:true` yeterli degildir: baska modelin veya gevsetilmis esigin
 * raporu bu kosuya tasinamaz.
 */
export function assertPromotionEvidence(
  evidence: unknown,
  identity: AuditExecutionIdentity,
): asserts evidence is PromotionEvidence {
  const root = record(evidence)
  const subject = record(root.subject)
  const benchmark = record(root.benchmark)
  const promotion = record(benchmark.promotion)
  if (promotion.passed !== true) throw new Error('terfi kaniti benchmark kapisini gecmemis')
  if (canonicalJson(promotion.policy) !== canonicalJson(DEFAULT_PROMOTION_POLICY)) {
    throw new Error('terfi kaniti varsayilan guvence politikasini kullanmiyor')
  }

  const config = record(subject.config)
  const evidenceGenerationConfig = {
    blindSamples: config.blindSamples,
    blindTemperature: config.blindTemperature,
    adversarialTemperature: config.adversarialTemperature,
    verifierTemperature: config.verifierTemperature,
    maxOutputTokens: config.maxOutputTokens,
  }
  const checks: Array<[string, unknown, unknown]> = [
    ['policyVersion', subject.policyVersion, identity.policyVersion],
    ['providerIds', subject.providerIds, identity.providerIds],
    ['modelIds', subject.modelIds, identity.modelIds],
    ['promptVersions', subject.promptVersions, identity.promptVersions],
    ['generationConfig', evidenceGenerationConfig, identity.generationConfig],
  ]
  for (const [label, actual, expected] of checks) {
    if (canonicalJson(actual) !== canonicalJson(expected)) {
      throw new Error(`terfi kaniti kosu kimligiyle uyusmuyor: ${label}`)
    }
  }
}

export function validateGoldLabels(labels: readonly GoldLabel[]): void {
  if (!Array.isArray(labels)) throw new Error('gold etiket kok nesnesi dizi olmali')
  const seen = new Set<string>()
  const seenQuestions = new Set<string>()
  for (const label of labels) {
    if (!label || typeof label !== 'object' || typeof label.questionId !== 'string' || !label.questionId.trim() || !Array.isArray(label.flawCodes)) {
      throw new Error('gecersiz gold etiket yapisi')
    }
    if (typeof label.contentSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(label.contentSha256)) throw new Error(`gecersiz gold content hash: ${label.questionId}`)
    if (!Number.isInteger(label.reviewerCount) || label.reviewerCount < 2) throw new Error(`gold etiket en az iki reviewer ister: ${label.questionId}`)
    if (
      !Array.isArray(label.reviewerRefs)
      || label.reviewerRefs.length !== label.reviewerCount
      || new Set(label.reviewerRefs.map((ref: unknown) => typeof ref === 'string' ? ref.toLowerCase() : ref)).size !== label.reviewerRefs.length
      || label.reviewerRefs.some((ref: unknown) => typeof ref !== 'string' || !/^[a-f0-9]{64}$/i.test(ref))
    ) throw new Error(`gold etiket farkli ve anonim reviewer referanslari ister: ${label.questionId}`)
    if (label.adjudication !== 'consensus' && label.adjudication !== 'adjudicated') {
      throw new Error(`gold adjudikasyon tamamlanmamis: ${label.questionId}`)
    }
    if (label.adjudication === 'consensus' && label.reviewerCount !== 2) {
      throw new Error(`gold consensus tam iki reviewer ister: ${label.questionId}`)
    }
    if (label.adjudication === 'adjudicated' && label.reviewerCount !== 3) {
      throw new Error(`gold adjudikasyon tam uc reviewer ister: ${label.questionId}`)
    }
    const key = `${label.questionId}:${label.contentSha256.toLowerCase()}`
    if (seen.has(key)) throw new Error(`yinelenen gold etiket: ${key}`)
    seen.add(key)
    if (seenQuestions.has(label.questionId)) throw new Error(`gold sette ayni soru birden fazla revizyonla yinelenemez: ${label.questionId}`)
    seenQuestions.add(label.questionId)
    if (new Set(label.flawCodes).size !== label.flawCodes.length) throw new Error(`yinelenen gold kusur kodu: ${label.questionId}`)
    for (const code of label.flawCodes) {
      if (!FLAW_CODES.includes(code)) throw new Error(`bilinmeyen gold kusur kodu: ${String(code)}`)
    }
  }
}

function isInconclusive(verdict: Verdict): boolean {
  return verdict === 'INCONCLUSIVE'
}

export function evaluateBenchmark(
  labels: readonly GoldLabel[],
  items: readonly CalibrationItem[],
  transportFailureRate: number,
  policy: PromotionPolicy = DEFAULT_PROMOTION_POLICY,
): BenchmarkReport {
  validateGoldLabels(labels)
  if (!Number.isFinite(transportFailureRate) || transportFailureRate < 0 || transportFailureRate > 1) {
    throw new Error('transport failure rate 0 ile 1 arasinda olmali')
  }
  const itemByKey = new Map(items.map((item) => [`${item.questionId}:${item.contentSha256.toLowerCase()}`, item]))
  const matched: Pair[] = labels.flatMap((label) => {
    const item = itemByKey.get(`${label.questionId}:${label.contentSha256.toLowerCase()}`)
    return item ? [{ label, item }] : []
  })
  const evaluated = matched.filter(({ item }) => !isInconclusive(item.verdict))
  const expectedIssue = evaluated.map(({ label }) => label.flawCodes.length > 0)
  const actualIssue = evaluated.map(({ item }) => item.findings.length > 0 || item.verdict !== 'APPROVED')
  const overall = metrics(expectedIssue, actualIssue)
  const byFlaw = Object.fromEntries(FLAW_CODES.map((code) => [
    code,
    metrics(
      evaluated.map(({ label }) => label.flawCodes.includes(code)),
      evaluated.map(({ item }) => item.findings.some((finding) => finding.code === code)),
    ),
  ])) as Record<FlawCode, BinaryMetrics>
  const exactMatches = evaluated.filter(({ label, item }) => {
    const expected = uniqueCodes(label.flawCodes)
    const actual = uniqueCodes(item.findings.map((finding) => finding.code))
    return expected.length === actual.length && expected.every((code, i) => code === actual[i])
  }).length
  const coverage = labels.length > 0 ? evaluated.length / labels.length : 0
  const exactFlawMatchRate = ratio(exactMatches, evaluated.length)
  const failures: string[] = []
  if (labels.length < policy.minLabels) failures.push(`label_count ${labels.length} < ${policy.minLabels}`)
  if (overall.positiveSupport < policy.minPositiveLabels) failures.push(`positive_support ${overall.positiveSupport} < ${policy.minPositiveLabels}`)
  if (overall.negativeSupport < policy.minNegativeLabels) failures.push(`negative_support ${overall.negativeSupport} < ${policy.minNegativeLabels}`)
  if (coverage < policy.minCoverage) failures.push(`coverage ${coverage.toFixed(4)} < ${policy.minCoverage}`)
  if (transportFailureRate > policy.maxTransportFailureRate) failures.push(`transport_failure_rate ${transportFailureRate.toFixed(4)} > ${policy.maxTransportFailureRate}`)
  if (overall.balancedAccuracy === null || overall.balancedAccuracy < policy.minBalancedAccuracy) failures.push(`balanced_accuracy ${overall.balancedAccuracy ?? 'null'} < ${policy.minBalancedAccuracy}`)
  if (overall.falsePositiveRateUpper95 === null || overall.falsePositiveRateUpper95 > policy.maxFalsePositiveRateUpper95) failures.push(`fpr_upper95 ${overall.falsePositiveRateUpper95 ?? 'null'} > ${policy.maxFalsePositiveRateUpper95}`)
  if (overall.falseNegativeRateUpper95 === null || overall.falseNegativeRateUpper95 > policy.maxFalseNegativeRateUpper95) failures.push(`fnr_upper95 ${overall.falseNegativeRateUpper95 ?? 'null'} > ${policy.maxFalseNegativeRateUpper95}`)
  if (exactFlawMatchRate === null || exactFlawMatchRate < policy.minExactFlawMatchRate) failures.push(`exact_flaw_match ${exactFlawMatchRate ?? 'null'} < ${policy.minExactFlawMatchRate}`)

  return {
    labelCount: labels.length,
    matchedCount: matched.length,
    evaluatedCount: evaluated.length,
    inconclusiveCount: matched.length - evaluated.length,
    coverage,
    exactFlawMatchRate,
    overall,
    byFlaw,
    promotion: { passed: failures.length === 0, policy, failures },
  }
}
