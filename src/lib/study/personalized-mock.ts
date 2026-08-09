import { DENEME_CONFIGS } from '@/lib/constants/modes'
import type { GameSlug } from '@/lib/constants/games'

export interface PersonalizedMockCandidate {
  id: string
  category: string
}

export interface PersonalizedMockAnswer {
  questionId: string
  category: string
  isCorrect: boolean
  isSkipped?: boolean | null
  answeredAt: string
}

export interface PersonalizedMockInput {
  game: GameSlug
  candidates: PersonalizedMockCandidate[]
  /** Preferred name for the user's answer history. */
  answers?: PersonalizedMockAnswer[]
  /** Backwards-friendly alias for callers that name this collection history. */
  history?: PersonalizedMockAnswer[]
  size?: number
  seed?: string | number
}

export interface PersonalizedMockBreakdown {
  wrong: number
  weak: number
  coverage: number
  weakCategories: string[]
}

export type PersonalizedMockSourceBucket = 'wrong' | 'weak' | 'coverage'

export interface PersonalizedMockItem {
  questionId: string
  sourceBucket: PersonalizedMockSourceBucket
}

export interface PersonalizedMockSelection {
  questionIds: string[]
  /** Immutable per-question provenance in the same final order as questionIds. */
  items: PersonalizedMockItem[]
  breakdown: PersonalizedMockBreakdown
}

export const PERSONALIZED_MOCK_DEFAULT_SIZE = 40
const WRONG_QUOTA = 16
const WRONG_AND_WEAK_QUOTA = 32
const MIN_WEAK_CATEGORY_SAMPLE = 5
const WEAK_CATEGORY_LIMIT = 3

function hashSeed(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededRandom(seed: string): () => number {
  let state = hashSeed(seed)
  return () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function shuffledCandidates(
  candidates: PersonalizedMockCandidate[],
  seed: string | number,
  stage: string,
): PersonalizedMockCandidate[] {
  // A canonical order before Fisher-Yates makes the result independent of DB/input order.
  const shuffled = [...candidates].sort((a, b) => a.id.localeCompare(b.id))
  const random = seededRandom(`${seed}:${stage}`)

  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapWith = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[swapWith]] = [shuffled[swapWith], shuffled[index]]
  }

  return shuffled
}

function normalizeCandidates(candidates: PersonalizedMockCandidate[]): PersonalizedMockCandidate[] {
  const byId = new Map<string, PersonalizedMockCandidate>()

  for (const candidate of [...candidates].sort((a, b) => {
    const idOrder = a.id.localeCompare(b.id)
    return idOrder !== 0 ? idOrder : a.category.localeCompare(b.category)
  })) {
    if (!byId.has(candidate.id)) byId.set(candidate.id, candidate)
  }

  return [...byId.values()]
}

function newestAnswerByQuestion(answers: PersonalizedMockAnswer[]): Map<string, PersonalizedMockAnswer> {
  const latest = new Map<string, PersonalizedMockAnswer>()

  for (const answer of answers) {
    if (answer.isSkipped === true) continue

    const current = latest.get(answer.questionId)
    // DB zaman damgaları eşitse giriş sırasına bağlı kalma. Aynı soruya ait JOIN
    // kategorisi sabittir; eşzamanlı doğru+yanlış olayında korumacı olarak doğruyu
    // son durum sayıp zaten düzeltilmiş soruyu "açık yanlış" diye enjekte etmeyiz.
    if (!current || answer.answeredAt > current.answeredAt || (
      answer.answeredAt === current.answeredAt
      && answer.isCorrect
      && !current.isCorrect
    )) {
      latest.set(answer.questionId, answer)
    }
  }

  return latest
}

function weakestCategories(answers: PersonalizedMockAnswer[]): string[] {
  const strengths = new Map<string, { correct: number; total: number }>()

  for (const answer of answers) {
    if (answer.isSkipped === true) continue

    const strength = strengths.get(answer.category) ?? { correct: 0, total: 0 }
    strength.total++
    if (answer.isCorrect) strength.correct++
    strengths.set(answer.category, strength)
  }

  return [...strengths.entries()]
    .filter(([, strength]) => strength.total >= MIN_WEAK_CATEGORY_SAMPLE)
    .sort(([leftCategory, left], [rightCategory, right]) => {
      const rateOrder = (left.correct / left.total) - (right.correct / right.total)
      if (rateOrder !== 0) return rateOrder
      const sampleOrder = right.total - left.total
      return sampleOrder !== 0 ? sampleOrder : leftCategory.localeCompare(rightCategory)
    })
    .slice(0, WEAK_CATEGORY_LIMIT)
    .map(([category]) => category)
}

/**
 * Builds a pure, reproducible "Akilli Deneme" question list.
 *
 * The stages are intentional: open wrong answers (up to 16), weak-category
 * practice (which absorbs unused wrong capacity up to 32 combined), then the
 * configured category coverage/new-question pool. Each stage deduplicates IDs.
 */
export function selectPersonalizedMock({
  game,
  candidates,
  answers: suppliedAnswers,
  history,
  size = PERSONALIZED_MOCK_DEFAULT_SIZE,
  seed = 'personalized-mock',
}: PersonalizedMockInput): PersonalizedMockSelection {
  const answers = suppliedAnswers ?? history ?? []
  const targetSize = Number.isFinite(size) ? Math.max(0, Math.floor(size)) : 0
  const normalizedCandidates = normalizeCandidates(candidates)
  const candidateById = new Map(normalizedCandidates.map(candidate => [candidate.id, candidate]))
  const latestAnswers = newestAnswerByQuestion(answers)
  const weakCategories = weakestCategories(answers)
  const selected: string[] = []
  const used = new Set<string>()
  const sourceById = new Map<string, PersonalizedMockSourceBucket>()
  const selectedByCategory = new Map<string, number>()

  // Kapsam hedefi yalnız gerçekten mevcut adaylarla doldurulabilecek minimumları
  // rezerve eder. Böylece eksik içerikli bir kategori tüm denemeyi gereksiz yere
  // kilitlemez; mevcut kategorilerdeki hedefler ise kişiselleştirme tarafından
  // tüketilemez.
  const availableByCategory = new Map<string, number>()
  for (const candidate of normalizedCandidates) {
    availableByCategory.set(
      candidate.category,
      (availableByCategory.get(candidate.category) ?? 0) + 1,
    )
  }
  const distribution = Object.fromEntries(
    Object.entries(DENEME_CONFIGS[game].questionDistribution).map(([category, required]) => [
      category,
      Math.min(required, availableByCategory.get(category) ?? 0),
    ]),
  )
  const requiredCoverageTotal = Object.values(distribution).reduce((sum, count) => sum + count, 0)
  const shouldReserveCoverage = targetSize >= requiredCoverageTotal

  function take(
    candidate: PersonalizedMockCandidate,
    sourceBucket: PersonalizedMockSourceBucket,
    reserveCoverage = false,
  ): boolean {
    if (selected.length >= targetSize || used.has(candidate.id)) return false

    if (reserveCoverage && shouldReserveCoverage) {
      const slotsAfterTake = targetSize - selected.length - 1
      let requiredAfterTake = 0
      for (const [category, required] of Object.entries(distribution)) {
        const selectedCount = selectedByCategory.get(category) ?? 0
        const nextCount = selectedCount + Number(candidate.category === category)
        requiredAfterTake += Math.max(0, required - nextCount)
      }
      if (requiredAfterTake > slotsAfterTake) return false
    }

    used.add(candidate.id)
    selected.push(candidate.id)
    sourceById.set(candidate.id, sourceBucket)
    selectedByCategory.set(
      candidate.category,
      (selectedByCategory.get(candidate.category) ?? 0) + 1,
    )
    return true
  }

  let wrong = 0
  const openWrongCandidates = normalizedCandidates.filter(candidate => {
    const latest = latestAnswers.get(candidate.id)
    return latest?.isCorrect === false
  })
  for (const candidate of shuffledCandidates(openWrongCandidates, seed, 'wrong')) {
    if (wrong >= Math.min(WRONG_QUOTA, targetSize)) break
    if (take(candidate, 'wrong', true)) wrong++
  }

  const weakTarget = Math.min(
    WRONG_AND_WEAK_QUOTA - wrong,
    targetSize - selected.length,
  )
  const weakPools = new Map<string, PersonalizedMockCandidate[]>(
    weakCategories.map(category => [
      category,
      shuffledCandidates(
        normalizedCandidates.filter(candidate => candidate.category === category),
        seed,
        `weak:${category}`,
      ),
    ] as const),
  )
  const weakIndexes = new Map<string, number>(weakCategories.map(category => [category, 0] as const))

  let weak = 0
  while (weak < weakTarget) {
    let pickedThisRound = false

    for (const category of weakCategories) {
      const pool = weakPools.get(category) ?? []
      let index = weakIndexes.get(category) ?? 0
      while (index < pool.length && used.has(pool[index].id)) index++
      weakIndexes.set(category, index)

      if (index >= pool.length) continue
      weakIndexes.set(category, index + 1)
      if (take(pool[index], 'weak', true)) {
        weak++
        pickedThisRound = true
      }
      if (weak >= weakTarget) break
    }

    if (!pickedThisRound) break
  }

  let coverage = 0
  for (const [category, required] of Object.entries(distribution)) {
    const alreadySelected = selectedByCategory.get(category) ?? 0
    const missing = Math.max(0, required - alreadySelected)
    let filled = 0

    for (const candidate of shuffledCandidates(
      normalizedCandidates.filter(item => item.category === category),
      seed,
      `coverage:${category}`,
    )) {
      if (filled >= missing || selected.length >= targetSize) break
      if (take(candidate, 'coverage')) {
        filled++
        coverage++
      }
    }
    if (selected.length >= targetSize) break
  }

  for (const candidate of shuffledCandidates(normalizedCandidates, seed, 'new')) {
    if (selected.length >= targetSize) break
    if (take(candidate, 'coverage')) coverage++
  }

  // Aşamalar pedagojik kaynağı ele vermesin: yanlış → zayıf → kapsam bloklarını
  // aynı günlük seed ile son kez karıştır. Candidate'lar normalize edildiği için
  // sonuç DB/input sırasından bağımsız kalır.
  const questionIds = shuffledCandidates(
    selected.map(id => candidateById.get(id)!).filter(Boolean),
    seed,
    'final',
  ).map(candidate => candidate.id)
  const items = questionIds.map((questionId) => ({
    questionId,
    sourceBucket: sourceById.get(questionId) ?? 'coverage',
  }))

  return {
    questionIds,
    items,
    breakdown: { wrong, weak, coverage, weakCategories },
  }
}

export const buildPersonalizedMock = selectPersonalizedMock
