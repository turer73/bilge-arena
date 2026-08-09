export type MockStrategySegmentKey = 'opening' | 'middle' | 'closing'

export interface MockStrategyEvidenceItem {
  position: number
  answered: boolean
  isCorrect: boolean | null
  isSkipped: boolean
  openedAt: string | null
  submittedAt: string | null
}

export interface MockStrategyEvidence {
  plannedCount: number
  startedAt: string
  deadlineAt: string
  items: MockStrategyEvidenceItem[]
}

export interface MockStrategySegment {
  key: MockStrategySegmentKey
  planned: number
  answered: number
  correct: number
  averageSeconds: number | null
  unknownTiming: number
}

export type MockStrategyRecommendationCode =
  | 'check_fast_answers'
  | 'set_first_pass_limit'
  | 'reserve_final_pass'
  | 'timing_evidence_incomplete'
  | 'keep_pace'

export interface MockStrategyAnalysis {
  basis: 'server_receipt_approximate'
  segments: MockStrategySegment[]
  unanswered: number
  unknownTiming: number
  rushedWrong: number
  stuck: number
  recommendations: MockStrategyRecommendationCode[]
}

const SEGMENT_KEYS: MockStrategySegmentKey[] = ['opening', 'middle', 'closing']
const RUSHED_WRONG_SECONDS = 15
const STUCK_SECONDS = 90

function segmentIndex(position: number, plannedCount: number): number {
  return Math.min(2, Math.floor((position * 3) / plannedCount))
}

function parseTimestamp(value: string): number | null {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function verifiedReceiptDuration(
  item: MockStrategyEvidenceItem,
  startedAt: number,
  deadlineAt: number,
): number | null {
  if (!item.openedAt || !item.submittedAt) return null
  const openedAt = parseTimestamp(item.openedAt)
  const submittedAt = parseTimestamp(item.submittedAt)
  if (
    openedAt === null
    || submittedAt === null
    || openedAt < startedAt
    || submittedAt < openedAt
    || submittedAt > deadlineAt
  ) return null
  return (submittedAt - openedAt) / 1_000
}

export function buildMockStrategyAnalysis(
  evidence: MockStrategyEvidence,
): MockStrategyAnalysis | null {
  if (!Number.isInteger(evidence.plannedCount) || evidence.plannedCount < 1 || evidence.plannedCount > 100) {
    return null
  }
  const startedAt = parseTimestamp(evidence.startedAt)
  const deadlineAt = parseTimestamp(evidence.deadlineAt)
  if (startedAt === null || deadlineAt === null || deadlineAt <= startedAt) return null

  const byPosition = new Map<number, MockStrategyEvidenceItem>()
  for (const item of evidence.items) {
    if (
      !Number.isInteger(item.position)
      || item.position < 0
      || item.position >= evidence.plannedCount
      || byPosition.has(item.position)
      || (item.answered && item.isCorrect === null)
      || (!item.answered && (item.isCorrect !== null || item.isSkipped))
    ) return null
    byPosition.set(item.position, item)
  }

  const segmentState = SEGMENT_KEYS.map((key) => ({
    key,
    planned: 0,
    answered: 0,
    correct: 0,
    timingTotal: 0,
    timingCount: 0,
    unknownTiming: 0,
  }))
  let unanswered = 0
  let unknownTiming = 0
  let rushedWrong = 0
  let stuck = 0

  for (let position = 0; position < evidence.plannedCount; position++) {
    const segment = segmentState[segmentIndex(position, evidence.plannedCount)]
    segment.planned++
    const item = byPosition.get(position)
    if (!item?.answered) {
      unanswered++
      continue
    }

    segment.answered++
    if (item.isCorrect) segment.correct++
    const duration = verifiedReceiptDuration(item, startedAt, deadlineAt)
    if (duration === null) {
      segment.unknownTiming++
      unknownTiming++
      continue
    }
    segment.timingTotal += duration
    segment.timingCount++
    if (!item.isCorrect && !item.isSkipped && duration < RUSHED_WRONG_SECONDS) rushedWrong++
    if (duration >= STUCK_SECONDS) stuck++
  }

  const recommendations: MockStrategyRecommendationCode[] = []
  if (rushedWrong > 0) recommendations.push('check_fast_answers')
  if (stuck > 0) recommendations.push('set_first_pass_limit')
  const opening = segmentState[0]
  const closing = segmentState[2]
  const openingRate = opening.planned > 0 ? opening.answered / opening.planned : 0
  const closingRate = closing.planned > 0 ? closing.answered / closing.planned : 0
  if (unanswered > 0 || closingRate < openingRate) recommendations.push('reserve_final_pass')
  if (unknownTiming > 0 && recommendations.length < 3) recommendations.push('timing_evidence_incomplete')
  if (recommendations.length === 0) recommendations.push('keep_pace')

  return {
    basis: 'server_receipt_approximate',
    segments: segmentState.map((segment) => ({
      key: segment.key,
      planned: segment.planned,
      answered: segment.answered,
      correct: segment.correct,
      averageSeconds: segment.timingCount > 0
        ? Math.round((segment.timingTotal / segment.timingCount) * 10) / 10
        : null,
      unknownTiming: segment.unknownTiming,
    })),
    unanswered,
    unknownTiming,
    rushedWrong,
    stuck,
    recommendations: recommendations.slice(0, 3),
  }
}
