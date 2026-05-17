import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetUser, mockAnswersChain, mockSessionsChain } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockAnswersChain: vi.fn(),
  mockSessionsChain: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'session_answers') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              returns: mockAnswersChain,
            })),
          })),
        }
      }
      if (table === 'game_sessions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: mockSessionsChain,
                })),
              })),
            })),
          })),
        }
      }
      return {}
    }),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({
    check: vi.fn(async () => ({ success: true })),
  })),
}))

import { GET } from '../route'

function makeRequest() {
  const headers = new Headers()
  headers.set('x-forwarded-for', '1.2.3.4')
  return new Request('http://localhost/api/profile/stats', { headers })
}

describe('GET /api/profile/stats', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeRequest() as never)
    expect(res.status).toBe(401)
  })

  it('returns 500 if answers query errors', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockAnswersChain.mockResolvedValue({ data: null, error: { code: '42501' } })
    mockSessionsChain.mockResolvedValue({ data: [], error: null })
    const res = await GET(makeRequest() as never)
    expect(res.status).toBe(500)
  })

  it('returns empty stats when no answers', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockAnswersChain.mockResolvedValue({ data: [], error: null })
    mockSessionsChain.mockResolvedValue({ data: [], error: null })
    const res = await GET(makeRequest() as never)
    const body = await res.json()
    expect(body.gameStats).toEqual([])
    expect(body.recentGames).toEqual([])
  })

  it('aggregates stats by game and category', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockAnswersChain.mockResolvedValue({
      data: [
        { is_correct: true, questions: { game: 'matematik', category: 'cebir' } },
        { is_correct: true, questions: { game: 'matematik', category: 'cebir' } },
        { is_correct: false, questions: { game: 'matematik', category: 'cebir' } },
        { is_correct: true, questions: { game: 'matematik', category: 'geometri' } },
        { is_correct: false, questions: { game: 'fen', category: 'fizik' } },
      ],
      error: null,
    })
    mockSessionsChain.mockResolvedValue({ data: [], error: null })

    const res = await GET(makeRequest() as never)
    const body = await res.json()
    expect(body.gameStats).toHaveLength(2)
    const mat = body.gameStats.find((g: { game: string }) => g.game === 'matematik')
    expect(mat.total).toBe(4)
    expect(mat.correct).toBe(3)
    expect(mat.percentage).toBe(75)
    expect(mat.categories).toHaveLength(2)
  })

  it('returns recent games up to 10', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockAnswersChain.mockResolvedValue({ data: [], error: null })
    mockSessionsChain.mockResolvedValue({
      data: [
        { id: 's1', game: 'matematik', mode: 'classic', correct_count: 8, total_questions: 10, total_xp: 80, completed_at: '2026-05-17T00:00:00Z' },
      ],
      error: null,
    })

    const res = await GET(makeRequest() as never)
    const body = await res.json()
    expect(body.recentGames).toHaveLength(1)
    expect(body.recentGames[0].correct_count).toBe(8)
  })

  it('sets Cache-Control no-store', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockAnswersChain.mockResolvedValue({ data: [], error: null })
    mockSessionsChain.mockResolvedValue({ data: [], error: null })
    const res = await GET(makeRequest() as never)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('skips answers with null questions join', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockAnswersChain.mockResolvedValue({
      data: [
        { is_correct: true, questions: null },
        { is_correct: true, questions: { game: 'matematik', category: 'cebir' } },
      ],
      error: null,
    })
    mockSessionsChain.mockResolvedValue({ data: [], error: null })
    const res = await GET(makeRequest() as never)
    const body = await res.json()
    expect(body.gameStats).toHaveLength(1)
    expect(body.gameStats[0].total).toBe(1)
  })
})
