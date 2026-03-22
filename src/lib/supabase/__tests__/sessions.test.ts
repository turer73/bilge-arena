import { describe, it, expect, beforeEach, vi } from 'vitest'

// ─── Supabase mock ─────────────────────────────────────

const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockSelect = vi.fn()
const mockSingle = vi.fn()
const mockEq = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      const chain = {
        insert: (data: unknown) => {
          mockInsert(table, data)
          return {
            select: (cols: string) => {
              mockSelect(cols)
              return {
                single: () => {
                  mockSingle()
                  if (table === 'game_sessions') {
                    return { data: { id: 'session-123' }, error: null }
                  }
                  return { data: null, error: null }
                },
              }
            },
          }
        },
        update: (data: unknown) => {
          mockUpdate(table, data)
          return {
            eq: (_col: string, _val: string) => {
              mockEq(_col, _val)
              return { error: null }
            },
          }
        },
      }
      return chain
    },
  }),
}))

// Import AFTER mock
import { saveGameSession } from '../sessions'
import type { AnswerRecord } from '@/stores/quiz-store'

// ─── Test verileri ─────────────────────────────────────

const baseParams = {
  userId: 'user-1',
  game: 'matematik' as const,
  mode: 'classic',
  answers: [
    { questionId: 'q1', selectedOption: 1, isCorrect: true, timeTaken: 5, xpEarned: 15 },
    { questionId: 'q2', selectedOption: 0, isCorrect: false, timeTaken: 12, xpEarned: 0 },
    { questionId: 'q3', selectedOption: 2, isCorrect: true, timeTaken: 8, xpEarned: 18 },
  ] as AnswerRecord[],
  totalXP: 33,
  maxStreak: 1,
}

describe('saveGameSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('session ID dondurmeli', async () => {
    const result = await saveGameSession(baseParams)
    expect(result).toBe('session-123')
  })

  it('game_sessions tablosuna dogru veriler INSERT etmeli', async () => {
    await saveGameSession(baseParams)

    // ilk insert game_sessions'a
    const [table, data] = mockInsert.mock.calls[0]
    expect(table).toBe('game_sessions')
    expect(data.user_id).toBe('user-1')
    expect(data.game).toBe('matematik')
    expect(data.mode).toBe('classic')
    expect(data.status).toBe('active')
    expect(data.total_questions).toBe(3)
    expect(data.correct_count).toBe(2) // 2 dogru
    expect(data.wrong_count).toBe(1) // 1 yanlis
  })

  it('XP dagilimini %70/%30 yapmali', async () => {
    await saveGameSession(baseParams)

    const [, data] = mockInsert.mock.calls[0]
    expect(data.base_xp).toBe(Math.floor(33 * 0.7)) // 23
    expect(data.bonus_xp).toBe(33 - Math.floor(33 * 0.7)) // 10
    expect(data.total_xp).toBe(33)
  })

  it('ortalama sureyi dogru hesaplamali', async () => {
    await saveGameSession(baseParams)

    const [, data] = mockInsert.mock.calls[0]
    const totalTime = 5 + 12 + 8 // 25
    expect(data.time_spent_sec).toBe(25)
    expect(data.avg_time_sec).toBeCloseTo(8.3, 1) // 25/3 ≈ 8.333
  })

  it('session_answers toplu INSERT etmeli', async () => {
    await saveGameSession(baseParams)

    // ikinci insert session_answers'a
    const [table, data] = mockInsert.mock.calls[1]
    expect(table).toBe('session_answers')
    expect(data).toHaveLength(3)
    expect(data[0].session_id).toBe('session-123')
    expect(data[0].question_id).toBe('q1')
    expect(data[0].is_correct).toBe(true)
    expect(data[1].is_correct).toBe(false)
    expect(data[2].question_order).toBe(2)
  })

  it('XP > 0 ise xp_log INSERT etmeli', async () => {
    await saveGameSession(baseParams)

    // 3. insert xp_log
    const xpCall = mockInsert.mock.calls[2]
    expect(xpCall[0]).toBe('xp_log')
    expect(xpCall[1].amount).toBe(33)
    expect(xpCall[1].reason).toBe('session_complete')
  })

  it('XP = 0 ise xp_log INSERT etmemeli', async () => {
    await saveGameSession({ ...baseParams, totalXP: 0 })

    // game_sessions + session_answers = 2 insert, xp_log yok
    const xpLogCalls = mockInsert.mock.calls.filter(([table]) => table === 'xp_log')
    expect(xpLogCalls).toHaveLength(0)
  })

  it('status completed olarak UPDATE etmeli', async () => {
    await saveGameSession(baseParams)

    const [table, data] = mockUpdate.mock.calls[0]
    expect(table).toBe('game_sessions')
    expect(data.status).toBe('completed')
    expect(data.completed_at).toBeTruthy()
  })

  it('bos cevap dizisi ile calismali', async () => {
    const result = await saveGameSession({
      ...baseParams,
      answers: [],
      totalXP: 0,
    })

    expect(result).toBe('session-123')
    const [, data] = mockInsert.mock.calls[0]
    expect(data.total_questions).toBe(0)
    expect(data.correct_count).toBe(0)
  })

  it('is_fast 10sn altinda true olmali', async () => {
    await saveGameSession(baseParams)

    const [, answerRows] = mockInsert.mock.calls[1]
    expect(answerRows[0].is_fast).toBe(true)  // 5sn < 10
    expect(answerRows[1].is_fast).toBe(false) // 12sn >= 10
    expect(answerRows[2].is_fast).toBe(true)  // 8sn < 10
  })

  it('filter parametrelerini gecirmeli', async () => {
    await saveGameSession({
      ...baseParams,
      category: 'geometri',
      difficulty: 3,
    })

    const [, data] = mockInsert.mock.calls[0]
    expect(data.filter_category).toBe('geometri')
    expect(data.filter_difficulty).toBe(3)
  })
})
