export const DAILY_PLAN_SLOT_QUOTAS = {
  due: 5,
  weak_outcome: 5,
  current_target: 3,
  challenge: 1,
  student_choice: 1,
} as const

export type DailyPlanSlotType = keyof typeof DAILY_PLAN_SLOT_QUOTAS
export type DailyPlanSourceType = DailyPlanSlotType | 'fresh' | 'legacy'

export interface DailyPlanCandidate {
  questionId: string
  sourceType: DailyPlanSourceType
  sourceRef?: string | null
}

export interface DailyPlanDraftItem extends DailyPlanCandidate {
  position: number
  slotType: DailyPlanSlotType
}

export interface ComposePlanV2Input {
  pools: Record<DailyPlanSlotType, DailyPlanCandidate[]>
  freshCandidates: DailyPlanCandidate[]
}

const SLOT_ORDER = Object.keys(DAILY_PLAN_SLOT_QUOTAS) as DailyPlanSlotType[]
const FALLBACK_SOURCE_ORDER: Array<DailyPlanSlotType | 'fresh'> = [
  'due',
  'weak_outcome',
  'current_target',
  'challenge',
  'student_choice',
  'fresh',
]

/**
 * Saf R1.2 composer. Once her slot kendi kaynagindan dolar; eksikler kaynak
 * onceligi sabit overflow havuzundan tamamlanir. `slotType` hedef kotayi,
 * `sourceType` gercek kaynagi korur. Soru kimligi tum plan boyunca tektir.
 */
export function composePlanV2({ pools, freshCandidates }: ComposePlanV2Input): DailyPlanDraftItem[] {
  const used = new Set<string>()
  const poolOffsets = new Map<DailyPlanSlotType, number>()
  const slots: Array<{ slotType: DailyPlanSlotType; candidate: DailyPlanCandidate | null }> = []

  function takeFromOwnPool(slotType: DailyPlanSlotType): DailyPlanCandidate | null {
    const pool = pools[slotType]
    let offset = poolOffsets.get(slotType) ?? 0
    while (offset < pool.length) {
      const candidate = pool[offset++]
      poolOffsets.set(slotType, offset)
      if (!candidate.questionId || used.has(candidate.questionId)) continue
      used.add(candidate.questionId)
      return candidate
    }
    poolOffsets.set(slotType, offset)
    return null
  }

  for (const slotType of SLOT_ORDER) {
    for (let index = 0; index < DAILY_PLAN_SLOT_QUOTAS[slotType]; index++) {
      slots.push({ slotType, candidate: takeFromOwnPool(slotType) })
    }
  }

  const overflowPools: Record<DailyPlanSlotType | 'fresh', DailyPlanCandidate[]> = {
    ...pools,
    fresh: freshCandidates,
  }
  const overflow = FALLBACK_SOURCE_ORDER.flatMap((source) => overflowPools[source])
  let overflowOffset = 0

  for (const slot of slots) {
    if (slot.candidate) continue
    while (overflowOffset < overflow.length) {
      const candidate = overflow[overflowOffset++]
      if (!candidate.questionId || used.has(candidate.questionId)) continue
      used.add(candidate.questionId)
      slot.candidate = candidate
      break
    }
  }

  return slots
    .filter((slot): slot is { slotType: DailyPlanSlotType; candidate: DailyPlanCandidate } => !!slot.candidate)
    .map((slot, index) => ({
      position: index + 1,
      slotType: slot.slotType,
      ...slot.candidate,
      sourceRef: slot.candidate.sourceRef ?? null,
    }))
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Stabil, kriptografik olmayan gunluk siralama; DB random/fuzz kullanmaz. */
export function stableDailyOrder<T>(items: T[], seed: string, getId: (item: T) => string): T[] {
  return [...items].sort((left, right) => {
    const leftId = getId(left)
    const rightId = getId(right)
    const scoreDiff = fnv1a(`${seed}|${leftId}`) - fnv1a(`${seed}|${rightId}`)
    return scoreDiff || leftId.localeCompare(rightId)
  })
}
