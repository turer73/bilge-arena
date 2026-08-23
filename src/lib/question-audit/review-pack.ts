import { createHash } from 'node:crypto'
import type { Verdict } from './types'

export const REVIEW_GAMES = ['matematik', 'turkce', 'fen', 'sosyal', 'wordquest'] as const
export type ReviewGame = typeof REVIEW_GAMES[number]

export interface ReviewCandidate {
  questionId: string
  revisionId: string
  contentSha256: string
  game: ReviewGame
  category: string
  subcategory: string | null
  topic: string | null
  examRef: string | null
  difficulty: number
  content: Record<string, unknown>
  verdict: Verdict
}

export interface SelectedReviewCandidate extends ReviewCandidate {
  selectionStratum: 'approved' | 'flagged'
}

export interface ReviewSelectionOptions {
  seed: string
  perGame?: number
  flaggedPerGame?: number
  games?: readonly ReviewGame[]
}

export interface BlindReviewPacket {
  schemaVersion: 'question-audit-blind-pack@1'
  selectionId: string
  items: Array<{
    itemNumber: number
    questionId: string
    revisionId: string
    contentSha256: string
    game: ReviewGame
    category: string
    subcategory: string | null
    topic: string | null
    examRef: string | null
    difficulty: number
    content: Record<string, unknown>
  }>
}

function rank(seed: string, value: string): string {
  return createHash('sha256').update(`${seed}\u0000${value}`).digest('hex')
}

function validateCandidate(candidate: ReviewCandidate): void {
  if (!candidate.questionId || !candidate.revisionId) throw new Error('review adayi questionId/revisionId ister')
  if (!/^[a-f0-9]{64}$/i.test(candidate.contentSha256)) throw new Error(`review adayi content hash gecersiz: ${candidate.questionId}`)
  if (!REVIEW_GAMES.includes(candidate.game)) throw new Error(`review adayi game gecersiz: ${candidate.questionId}`)
  if (!candidate.category.trim()) throw new Error(`review adayi category ister: ${candidate.questionId}`)
  if (!Number.isInteger(candidate.difficulty) || candidate.difficulty < 1 || candidate.difficulty > 5) {
    throw new Error(`review adayi difficulty gecersiz: ${candidate.questionId}`)
  }
  if (!candidate.content || typeof candidate.content !== 'object' || Array.isArray(candidate.content)) {
    throw new Error(`review adayi content gecersiz: ${candidate.questionId}`)
  }
}

function diversifiedTake(items: readonly ReviewCandidate[], quota: number, seed: string): ReviewCandidate[] {
  const buckets = new Map<string, ReviewCandidate[]>()
  for (const item of items) {
    const key = `${item.category}\u0000${item.difficulty}\u0000${item.examRef ?? ''}`
    const bucket = buckets.get(key) ?? []
    bucket.push(item)
    buckets.set(key, bucket)
  }
  for (const [key, bucket] of buckets) {
    bucket.sort((left, right) => rank(seed, `${key}\u0000${left.questionId}`).localeCompare(rank(seed, `${key}\u0000${right.questionId}`)))
  }
  const keys = [...buckets.keys()].sort((left, right) => rank(seed, left).localeCompare(rank(seed, right)))
  const selected: ReviewCandidate[] = []
  while (selected.length < quota) {
    let progressed = false
    for (const key of keys) {
      const next = buckets.get(key)!.shift()
      if (!next) continue
      selected.push(next)
      progressed = true
      if (selected.length === quota) break
    }
    if (!progressed) break
  }
  return selected
}

export function selectBlindReviewSet(
  candidates: readonly ReviewCandidate[],
  options: ReviewSelectionOptions,
): SelectedReviewCandidate[] {
  if (!options.seed.trim()) throw new Error('review selection seed zorunlu')
  const games = options.games ?? REVIEW_GAMES
  const perGame = options.perGame ?? 20
  const flaggedPerGame = options.flaggedPerGame ?? Math.floor(perGame / 2)
  if (!Number.isInteger(perGame) || perGame < 2) throw new Error('perGame en az 2 olmali')
  if (!Number.isInteger(flaggedPerGame) || flaggedPerGame < 1 || flaggedPerGame >= perGame) {
    throw new Error('flaggedPerGame 1 ile perGame-1 arasinda olmali')
  }
  const seenQuestions = new Set<string>()
  for (const candidate of candidates) {
    validateCandidate(candidate)
    if (seenQuestions.has(candidate.questionId)) throw new Error(`yinelenen review adayi: ${candidate.questionId}`)
    seenQuestions.add(candidate.questionId)
  }

  const selected: SelectedReviewCandidate[] = []
  for (const game of games) {
    const inGame = candidates.filter((candidate) => candidate.game === game)
    const approved = inGame.filter((candidate) => candidate.verdict === 'APPROVED')
    const flagged = inGame.filter((candidate) => candidate.verdict !== 'APPROVED')
    const approvedQuota = perGame - flaggedPerGame
    if (approved.length < approvedQuota || flagged.length < flaggedPerGame) {
      throw new Error(`${game} kotasi yetersiz: approved ${approved.length}/${approvedQuota}, flagged ${flagged.length}/${flaggedPerGame}`)
    }
    selected.push(...diversifiedTake(approved, approvedQuota, `${options.seed}:${game}:approved`).map((item) => ({
      ...item,
      selectionStratum: 'approved' as const,
    })))
    selected.push(...diversifiedTake(flagged, flaggedPerGame, `${options.seed}:${game}:flagged`).map((item) => ({
      ...item,
      selectionStratum: 'flagged' as const,
    })))
  }
  return selected.sort((left, right) => rank(options.seed, left.questionId).localeCompare(rank(options.seed, right.questionId)))
}

export function toBlindReviewPacket(selected: readonly SelectedReviewCandidate[]): BlindReviewPacket {
  const selectionId = createHash('sha256')
    .update(selected.map((item) => `${item.questionId}:${item.contentSha256.toLowerCase()}`).sort().join('\n'))
    .digest('hex')
  return {
    schemaVersion: 'question-audit-blind-pack@1',
    selectionId,
    items: selected.map((item, index) => ({
      itemNumber: index + 1,
      questionId: item.questionId,
      revisionId: item.revisionId,
      contentSha256: item.contentSha256.toLowerCase(),
      game: item.game,
      category: item.category,
      subcategory: item.subcategory,
      topic: item.topic,
      examRef: item.examRef,
      difficulty: item.difficulty,
      content: item.content,
    })),
  }
}
