import { describe, expect, it } from 'vitest'
import {
  composePlanV2,
  stableDailyOrder,
  type DailyPlanCandidate,
  type DailyPlanSlotType,
} from '../compose-plan-v2'

function candidates(prefix: string, count: number, sourceType: DailyPlanCandidate['sourceType']): DailyPlanCandidate[] {
  return Array.from({ length: count }, (_, index) => ({
    questionId: `${prefix}-${index}`,
    sourceType,
    sourceRef: prefix,
  }))
}

function fullPools(): Record<DailyPlanSlotType, DailyPlanCandidate[]> {
  return {
    due: candidates('due', 5, 'due'),
    weak_outcome: candidates('weak', 5, 'weak_outcome'),
    current_target: candidates('target', 3, 'current_target'),
    challenge: candidates('challenge', 1, 'challenge'),
    student_choice: candidates('choice', 1, 'student_choice'),
  }
}

describe('composePlanV2', () => {
  it('dolu havuzlarda tam 5/5/3/1/1 ve benzersiz 15 oge uretir', () => {
    const plan = composePlanV2({ pools: fullPools(), freshCandidates: [] })

    expect(plan).toHaveLength(15)
    expect(new Set(plan.map((item) => item.questionId)).size).toBe(15)
    expect(plan.map((item) => item.position)).toEqual(Array.from({ length: 15 }, (_, index) => index + 1))
    expect(plan.filter((item) => item.slotType === 'due')).toHaveLength(5)
    expect(plan.filter((item) => item.slotType === 'weak_outcome')).toHaveLength(5)
    expect(plan.filter((item) => item.slotType === 'current_target')).toHaveLength(3)
    expect(plan.filter((item) => item.slotType === 'challenge')).toHaveLength(1)
    expect(plan.filter((item) => item.slotType === 'student_choice')).toHaveLength(1)
    expect(plan.every((item) => item.slotType === item.sourceType)).toBe(true)
  })

  it('eksik hedef slotlari deterministik overflow ile doldurur ve gercek kaynagi korur', () => {
    const pools = fullPools()
    pools.due = pools.due.slice(0, 2)
    pools.weak_outcome.push(...candidates('weak-extra', 3, 'weak_outcome'))

    const plan = composePlanV2({ pools, freshCandidates: candidates('fresh', 10, 'fresh') })
    const dueSlots = plan.filter((item) => item.slotType === 'due')

    expect(plan).toHaveLength(15)
    expect(dueSlots).toHaveLength(5)
    expect(dueSlots.filter((item) => item.sourceType === 'due')).toHaveLength(2)
    expect(dueSlots.filter((item) => item.sourceType !== 'due')).toHaveLength(3)
    expect(new Set(plan.map((item) => item.questionId)).size).toBe(15)
  })

  it('kovalar arasi cakisan soruyu yalniz bir kez kullanir', () => {
    const pools = fullPools()
    pools.weak_outcome.unshift({ ...pools.due[0], sourceType: 'weak_outcome' })

    const plan = composePlanV2({ pools, freshCandidates: candidates('fresh', 5, 'fresh') })

    expect(plan).toHaveLength(15)
    expect(new Set(plan.map((item) => item.questionId)).size).toBe(15)
  })

  it('tum adaylar 15ten azsa tekrarsiz kisa ve bitisik pozisyonlu plan doner', () => {
    const emptyPools = {
      due: candidates('due', 1, 'due'),
      weak_outcome: [],
      current_target: candidates('target', 1, 'current_target'),
      challenge: [],
      student_choice: [],
    }
    const plan = composePlanV2({ pools: emptyPools, freshCandidates: candidates('fresh', 2, 'fresh') })

    expect(plan).toHaveLength(4)
    expect(plan.map((item) => item.position)).toEqual([1, 2, 3, 4])
    expect(new Set(plan.map((item) => item.questionId)).size).toBe(4)
  })
})

describe('stableDailyOrder', () => {
  const rows = Array.from({ length: 20 }, (_, index) => ({ id: `q-${index}` }))

  it('ayni seed icin girdiden bagimsiz ayni sirayi verir', () => {
    const first = stableDailyOrder(rows, 'u1|2026-08-08|matematik|TYT', (row) => row.id)
    const reversed = stableDailyOrder([...rows].reverse(), 'u1|2026-08-08|matematik|TYT', (row) => row.id)
    expect(first.map((row) => row.id)).toEqual(reversed.map((row) => row.id))
  })

  it('farkli seed secimi degistirir', () => {
    const first = stableDailyOrder(rows, 'u1|2026-08-08', (row) => row.id)
    const second = stableDailyOrder(rows, 'u2|2026-08-08', (row) => row.id)
    expect(first.map((row) => row.id)).not.toEqual(second.map((row) => row.id))
  })
})
