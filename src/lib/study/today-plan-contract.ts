import { isValidUuid } from '@/lib/utils/uuid'

export const DAILY_PLAN_SLOT_TYPES = [
  'due',
  'weak_outcome',
  'current_target',
  'challenge',
  'student_choice',
] as const

export const DAILY_PLAN_SOURCE_TYPES = [
  ...DAILY_PLAN_SLOT_TYPES,
  'fresh',
  'legacy',
] as const

export type TodayPlanSlotType = (typeof DAILY_PLAN_SLOT_TYPES)[number] | 'legacy'
export type TodayPlanSourceType = (typeof DAILY_PLAN_SOURCE_TYPES)[number]

export interface TodayPlanItem {
  questionId: string
  position: number
  slotType: TodayPlanSlotType
  sourceType: TodayPlanSourceType
  sourceLabel: string
  completed: boolean
}

export interface DailyPlanRpcSnapshot {
  planId: string
  game: string
  planDate: string
  examRef: string | null
  questionIds: string[]
  completedIds: string[]
  items: unknown[]
}

const SLOT_TYPES = new Set<string>(DAILY_PLAN_SLOT_TYPES)
const SOURCE_TYPES = new Set<string>(DAILY_PLAN_SOURCE_TYPES)

const SOURCE_LABELS: Record<TodayPlanSourceType, string> = {
  due: 'Tekrar zamanı',
  weak_outcome: 'Zayıf kazanım',
  current_target: 'Güncel hedef',
  challenge: 'Meydan okuma',
  student_choice: 'Senin seçimin',
  fresh: 'Yeni soru',
  legacy: 'Önceki günlük plan',
}

export function getTodayPlanSourceLabel(sourceType: TodayPlanSourceType): string {
  return SOURCE_LABELS[sourceType]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUuidArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && isValidUuid(item))
}

/** Runtime boundary for the SECURITY DEFINER RPC JSON payload. */
export function parseDailyPlanRpcSnapshot(value: unknown): DailyPlanRpcSnapshot | null {
  if (!isRecord(value)) return null
  if (
    typeof value.planId !== 'string'
    || !isValidUuid(value.planId)
    || typeof value.game !== 'string'
    || typeof value.planDate !== 'string'
    || (value.examRef !== null && typeof value.examRef !== 'string')
    || !isUuidArray(value.questionIds)
    || !isUuidArray(value.completedIds)
    || !Array.isArray(value.items)
  ) return null

  const questionSet = new Set(value.questionIds)
  if (
    value.questionIds.length > 15
    || questionSet.size !== value.questionIds.length
    || value.completedIds.some((id) => !questionSet.has(id))
  ) return null

  return {
    planId: value.planId,
    game: value.game,
    planDate: value.planDate,
    examRef: value.examRef,
    questionIds: value.questionIds,
    completedIds: value.completedIds,
    items: value.items,
  }
}

/**
 * Converts trusted DB/RPC rows to the public, identifier-minimal item contract.
 * Empty rows mean a pre-V2 plan and receive explicit legacy metadata.
 */
export function normalizeTodayPlanItems(
  rawItems: unknown[],
  questionIds: string[],
  completedIds: string[],
): TodayPlanItem[] | null {
  const questionSet = new Set(questionIds)
  if (
    questionIds.length > 15
    || questionSet.size !== questionIds.length
    || !questionIds.every(isValidUuid)
    || completedIds.some((id) => !questionSet.has(id))
  ) return null
  const completed = new Set(completedIds)
  if (rawItems.length === 0) {
    return questionIds.map((questionId, index) => ({
      questionId,
      position: index + 1,
      slotType: 'legacy',
      sourceType: 'legacy',
      sourceLabel: getTodayPlanSourceLabel('legacy'),
      completed: completed.has(questionId),
    }))
  }

  if (rawItems.length !== questionIds.length || rawItems.length > 15) return null
  const parsed: TodayPlanItem[] = []
  const seenQuestions = new Set<string>()
  const seenPositions = new Set<number>()

  for (const raw of rawItems) {
    if (!isRecord(raw)) return null
    const questionId = raw.questionId ?? raw.question_id
    const position = raw.position
    const slotType = raw.slotType ?? raw.slot_type
    const sourceType = raw.sourceType ?? raw.source_type
    const completedValue = raw.completed ?? (raw.completed_at !== null && raw.completed_at !== undefined)
    if (
      typeof questionId !== 'string'
      || !isValidUuid(questionId)
      || !questionIds.includes(questionId)
      || typeof position !== 'number'
      || !Number.isInteger(position)
      || position < 1
      || position > 15
      || typeof slotType !== 'string'
      || !SLOT_TYPES.has(slotType)
      || typeof sourceType !== 'string'
      || !SOURCE_TYPES.has(sourceType)
      || typeof completedValue !== 'boolean'
      || seenQuestions.has(questionId)
      || seenPositions.has(position)
    ) return null

    seenQuestions.add(questionId)
    seenPositions.add(position)
    parsed.push({
      questionId,
      position,
      slotType: slotType as TodayPlanSlotType,
      sourceType: sourceType as TodayPlanSourceType,
      sourceLabel: getTodayPlanSourceLabel(sourceType as TodayPlanSourceType),
      completed: completedValue,
    })
  }

  parsed.sort((left, right) => left.position - right.position)
  if (parsed.some((item, index) => item.position !== index + 1 || item.questionId !== questionIds[index])) {
    return null
  }
  return parsed
}
