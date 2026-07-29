import { describe, it, expect, vi } from 'vitest'
import { computeDueMap } from '../due-map'
import type { createServiceRoleClient } from '@/lib/supabase/service-role'

type Admin = ReturnType<typeof createServiceRoleClient>

function makeAdminMock(historyRows: Array<{
  question_id: string
  is_correct: boolean
  is_skipped?: boolean | null
  answered_at: string
}>) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'or', 'order']) {
    chain[m] = vi.fn(() => chain)
  }
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: historyRows, error: null }).then(resolve)
  return { from: vi.fn(() => chain) } as unknown as Admin
}

describe('computeDueMap', () => {
  it('bos questionIds icin sorgu atmadan bos Map doner', async () => {
    const admin = makeAdminMock([])
    const result = await computeDueMap(admin, 'u1', [])
    expect(result.size).toBe(0)
    expect(admin.from).not.toHaveBeenCalled()
  })

  it('her soru icin kendi gecmisini ayri fold eder', async () => {
    const t0 = '2026-01-01T00:00:00.000Z'
    const admin = makeAdminMock([
      { question_id: 'q1', is_correct: false, answered_at: t0 },
      { question_id: 'q2', is_correct: true, answered_at: t0 },
    ])
    const result = await computeDueMap(admin, 'u1', ['q1', 'q2'])
    expect(result.size).toBe(2)
    // q1 (Again): due = t0+1dk; q2 (Good): due = t0+10dk -- farkli due'lar,
    // birbirine karismadan ayri fold edildigini dogrular
    expect(result.get('q1')!.dueAt).toBe('2026-01-01T00:01:00.000Z')
    expect(result.get('q2')!.dueAt).toBe('2026-01-01T00:10:00.000Z')
  })

  it('isDue, now parametresine gore dogru hesaplanir', async () => {
    const t0 = '2026-01-01T00:00:00.000Z'
    const admin = makeAdminMock([{ question_id: 'q1', is_correct: false, answered_at: t0 }])
    const result = await computeDueMap(admin, 'u1', ['q1'])
    // due = t0+1dk; simdiki-zaman gercek Date.now() -- 2026-01-01'den cok sonra
    // oldugu icin isDue=true beklenir
    expect(result.get('q1')!.isDue).toBe(true)
  })

  it('skip olayini FSRS kartina katlamaz ve DB filtresini uygular', async () => {
    const t0 = '2026-01-01T00:00:00.000Z'
    const admin = makeAdminMock([
      { question_id: 'q1', is_correct: true, is_skipped: false, answered_at: t0 },
      { question_id: 'q1', is_correct: false, is_skipped: true, answered_at: '2026-01-03T00:00:00.000Z' },
    ])

    const result = await computeDueMap(admin, 'u1', ['q1'])

    expect(result.get('q1')!.dueAt).toBe('2026-01-01T00:10:00.000Z')
    const chain = (admin.from as ReturnType<typeof vi.fn>).mock.results[0].value
    expect(chain.or).toHaveBeenCalledWith('is_skipped.eq.false,is_skipped.is.null')
  })
})
