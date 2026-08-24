import { FLAW_SEVERITY, type FlawCode } from './types'
import type { GoldLabel } from './benchmark'

const FLAW_CODES = Object.keys(FLAW_SEVERITY) as FlawCode[]

export interface ExpertReviewLabel {
  questionId: string
  contentSha256: string
  flawCodes: FlawCode[]
}

export interface ExpertReviewFile {
  schemaVersion: 'question-audit-review@1'
  reviewerRef: string
  role: 'reviewer' | 'adjudicator'
  labels: ExpertReviewLabel[]
}

export interface HumanGoldDispute {
  questionId: string
  contentSha256: string
  reviewerFlawCodes: [FlawCode[], FlawCode[]]
}

function canonicalCodes(codes: readonly FlawCode[]): FlawCode[] {
  return [...new Set(codes)].sort()
}

function sameCodes(left: readonly FlawCode[], right: readonly FlawCode[]): boolean {
  const a = canonicalCodes(left)
  const b = canonicalCodes(right)
  return a.length === b.length && a.every((code, index) => code === b[index])
}

function validateReview(file: ExpertReviewFile): void {
  if (!file || file.schemaVersion !== 'question-audit-review@1') throw new Error('uzman etiketi schemaVersion gecersiz')
  if (!/^[a-f0-9]{64}$/i.test(file.reviewerRef)) throw new Error('reviewerRef anonim 64 hex karakter olmali')
  if (file.role !== 'reviewer' && file.role !== 'adjudicator') throw new Error('uzman etiketi role gecersiz')
  if (!Array.isArray(file.labels)) throw new Error('uzman etiketi labels dizisi ister')
  const seen = new Set<string>()
  const seenQuestions = new Set<string>()
  for (const label of file.labels) {
    if (!label || typeof label.questionId !== 'string' || !label.questionId.trim()) throw new Error('uzman etiketi questionId ister')
    if (!/^[a-f0-9]{64}$/i.test(label.contentSha256)) throw new Error(`uzman etiketi content hash gecersiz: ${label.questionId}`)
    if (!Array.isArray(label.flawCodes) || new Set(label.flawCodes).size !== label.flawCodes.length) {
      throw new Error(`uzman etiketi kusur kodlari gecersiz: ${label.questionId}`)
    }
    for (const code of label.flawCodes) {
      if (!FLAW_CODES.includes(code)) throw new Error(`bilinmeyen uzman kusur kodu: ${String(code)}`)
    }
    const key = `${label.questionId}:${label.contentSha256}`
    if (seen.has(key)) throw new Error(`yinelenen uzman etiketi: ${key}`)
    seen.add(key)
    if (seenQuestions.has(label.questionId)) throw new Error(`uzman ayni sorunun yalniz bir revizyonunu etiketleyebilir: ${label.questionId}`)
    seenQuestions.add(label.questionId)
  }
}

function labelMap(file: ExpertReviewFile): Map<string, ExpertReviewLabel> {
  return new Map(file.labels.map((label) => [`${label.questionId}:${label.contentSha256.toLowerCase()}`, label]))
}

export function findHumanGoldDisputes(files: readonly ExpertReviewFile[]): HumanGoldDispute[] {
  for (const file of files) validateReview(file)
  if (files.length !== 2 || files.some((file) => file.role !== 'reviewer')) {
    throw new Error('ayrisma tespiti tam iki reviewer dosyasi ister')
  }
  if (files[0].reviewerRef.toLowerCase() === files[1].reviewerRef.toLowerCase()) {
    throw new Error('reviewer referanslari farkli olmali')
  }
  const left = labelMap(files[0])
  const right = labelMap(files[1])
  if (left.size !== right.size || [...left.keys()].some((key) => !right.has(key))) {
    throw new Error('iki reviewer ayni soru ve revision hash listesini etiketlemeli')
  }
  return [...left.keys()].sort().flatMap((key) => {
    const first = left.get(key)!
    const second = right.get(key)!
    if (sameCodes(first.flawCodes, second.flawCodes)) return []
    return [{
      questionId: first.questionId,
      contentSha256: first.contentSha256.toLowerCase(),
      reviewerFlawCodes: [canonicalCodes(first.flawCodes), canonicalCodes(second.flawCodes)],
    }]
  })
}

/**
 * İki kör alan uzmanının etiketlerini birleştirir. Ayrışan her kayıt, ilk iki
 * kararı görmeden atanmış üçüncü ve farklı bir uzman tarafından adjudike
 * edilmeden gold sete giremez.
 */
export function buildHumanGoldSet(files: readonly ExpertReviewFile[]): GoldLabel[] {
  for (const file of files) validateReview(file)
  const reviewers = files.filter((file) => file.role === 'reviewer')
  const adjudicators = files.filter((file) => file.role === 'adjudicator')
  if (reviewers.length !== 2) throw new Error('gold set tam iki bagimsiz reviewer dosyasi ister')
  if (adjudicators.length > 1) throw new Error('gold set en fazla bir adjudicator dosyasi kabul eder')
  const refs = files.map((file) => file.reviewerRef.toLowerCase())
  if (new Set(refs).size !== refs.length) throw new Error('reviewer ve adjudicator referanslari farkli olmali')

  const left = labelMap(reviewers[0])
  const right = labelMap(reviewers[1])
  if (left.size !== right.size || [...left.keys()].some((key) => !right.has(key))) {
    throw new Error('iki reviewer ayni soru ve revision hash listesini etiketlemeli')
  }

  const disputes = [...left.keys()].filter((key) => !sameCodes(left.get(key)!.flawCodes, right.get(key)!.flawCodes))
  const adjudicator = adjudicators[0]
  const adjudicated = adjudicator ? labelMap(adjudicator) : new Map<string, ExpertReviewLabel>()
  if (disputes.length > 0 && !adjudicator) throw new Error(`${disputes.length} ayrisma adjudicator etiketi bekliyor`)
  if (adjudicated.size !== disputes.length || [...adjudicated.keys()].some((key) => !disputes.includes(key))) {
    throw new Error('adjudicator yalniz ve tum ayrisan kayitlari etiketlemeli')
  }

  return [...left.keys()].sort().map((key) => {
    const first = left.get(key)!
    const disputed = disputes.includes(key)
    const finalCodes = disputed ? adjudicated.get(key)!.flawCodes : first.flawCodes
    return {
      questionId: first.questionId,
      contentSha256: first.contentSha256.toLowerCase(),
      flawCodes: canonicalCodes(finalCodes),
      evidenceClass: 'curator_adjudicated',
      proofRef: first.contentSha256.toLowerCase(),
      reviewerCount: disputed ? 3 : 2,
      adjudication: disputed ? 'adjudicated' : 'consensus',
      reviewerRefs: disputed
        ? [reviewers[0].reviewerRef, reviewers[1].reviewerRef, adjudicator!.reviewerRef].map((ref) => ref.toLowerCase()).sort()
        : [reviewers[0].reviewerRef, reviewers[1].reviewerRef].map((ref) => ref.toLowerCase()).sort(),
    }
  })
}
