import { describe, expect, it, vi } from 'vitest'
import type { createServiceRoleClient } from '@/lib/supabase/service-role'

vi.mock('../fsrs-rollout', () => ({
  getPersistentFsrsReadRollout: vi.fn(() => ({
    enabled: true,
    bucket: 0,
    percentage: 100,
    reason: 'cohort',
  })),
}))

import { computeDueMap } from '../due-map'

type Admin = ReturnType<typeof createServiceRoleClient>

function thenableChain(result: unknown) {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'in', 'or', 'order']) {
    chain[method] = vi.fn(() => chain)
  }
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve)
  return chain
}

function makeAdmin(
  cards: unknown[],
  history: unknown[] = [],
): Admin & { from: ReturnType<typeof vi.fn> } {
  return {
    from: vi.fn((table: string) => thenableChain({
      data: table === 'review_cards' ? cards : history,
      error: null,
    })),
  } as unknown as Admin & { from: ReturnType<typeof vi.fn> }
}

describe('computeDueMap persistent read', () => {
  it('kalici karti history fold sorgusu atmadan kullanir', async () => {
    const admin = makeAdmin([{
      question_id: 'q1',
      due_at: '2026-01-03T00:00:00.000Z',
      stability: 2.3065,
      difficulty: 5.2824344,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 1,
      lapses: 0,
      learning_steps: 1,
      state: 1,
      last_review_at: '2026-01-01T00:00:00.000Z',
    }])

    const result = await computeDueMap(admin, 'u1', ['q1'])

    expect(result.get('q1')).toMatchObject({
      dueAt: '2026-01-03T00:00:00.000Z',
      stability: 2.3065,
      state: 'learning',
      reps: 1,
      source: 'persistent',
    })
    expect(admin.from).toHaveBeenCalledTimes(1)
    expect(admin.from).toHaveBeenCalledWith('review_cards')
  })

  it('backfill eksigi olan karti mevcut session history fold ile tamamlar', async () => {
    const admin = makeAdmin([], [{
      question_id: 'q-missing',
      is_correct: false,
      is_skipped: false,
      answered_at: '2026-01-01T00:00:00.000Z',
    }])

    const result = await computeDueMap(admin, 'u1', ['q-missing'])

    expect(result.get('q-missing')).toMatchObject({
      dueAt: '2026-01-01T00:01:00.000Z',
      source: 'fold',
    })
    expect(admin.from.mock.calls.map(([table]) => table)).toEqual([
      'review_cards',
      'session_answers',
    ])
  })

  it('gecersiz state satirini guvenli fallback ile yeniden katlar', async () => {
    const admin = makeAdmin([{
      question_id: 'q1',
      due_at: '2026-01-03T00:00:00.000Z',
      stability: 1,
      difficulty: 1,
      elapsed_days: 0,
      scheduled_days: 0,
      reps: 1,
      lapses: 0,
      learning_steps: 0,
      state: 99,
      last_review_at: '2026-01-01T00:00:00.000Z',
    }], [{
      question_id: 'q1',
      is_correct: true,
      is_skipped: false,
      answered_at: '2026-01-01T00:00:00.000Z',
    }])

    expect((await computeDueMap(admin, 'u1', ['q1'])).get('q1')?.source).toBe('fold')
  })
})
