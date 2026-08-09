import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mocks ───────────────────────────────────

const {
  mockGetUser,
  mockRateLimitCheck,
  mockExistingQuests,
  mockAllQuests,
  mockInsertQuests,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRateLimitCheck: vi.fn(async () => ({ success: true })),
  mockExistingQuests: vi.fn(),
  mockAllQuests: vi.fn(),
  mockInsertQuests: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

/**
 * Service-role mock — user_daily_quests + daily_quests.
 *
 * GET uses 3 chains:
 *   1) .from('user_daily_quests').select().eq().eq()  → existing quests list
 *   2) .from('daily_quests').select().eq()             → all active quests
 *   3) .from('user_daily_quests').insert().select()   → new quests insert
 */
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'user_daily_quests') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => mockExistingQuests()),
            })),
          })),
          insert: vi.fn(() => ({
            select: vi.fn(() => mockInsertQuests()),
          })),
        }
      }
      if (table === 'daily_quests') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => mockAllQuests()),
          })),
        }
      }
      return {}
    }),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({ check: mockRateLimitCheck })),
}))

import { GET, PATCH } from '../route'

// ─── Tests ──────────────────────────────────────────

describe('GET /api/quests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRateLimitCheck.mockResolvedValue({ success: true })
  })

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 429 on rate limit (H4 abuse)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRateLimitCheck.mockResolvedValueOnce({ success: false, retryAfter: 30 } as never)
    const res = await GET()
    expect(res.status).toBe(429)
  })

  it('returns existing quests without creating new ones', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockExistingQuests.mockResolvedValue({
      data: [
        { id: 'uq1', quest_id: 'q1', date: '2026-05-26', is_completed: false,
          quest: { id: 'q1', slug: 'play-3', xp_reward: 50 } },
      ],
      error: null,
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.quests).toHaveLength(1)
    // Dogrulama: yeni gorev olusturulmamali
    expect(mockInsertQuests).not.toHaveBeenCalled()
    expect(mockAllQuests).not.toHaveBeenCalled()
  })

  it('creates 3 new quests when none exist for today', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockExistingQuests.mockResolvedValue({ data: [], error: null })
    mockAllQuests.mockResolvedValue({
      data: [
        { id: 'q1', slug: 'play-3', is_active: true },
        { id: 'q2', slug: 'correct-5', is_active: true },
        { id: 'q3', slug: 'streak-2', is_active: true },
        { id: 'q4', slug: 'accuracy-80', is_active: true },
      ],
      error: null,
    })
    mockInsertQuests.mockResolvedValue({
      data: [
        { id: 'uq1', quest_id: 'q1', is_completed: false, quest: { id: 'q1' } },
        { id: 'uq2', quest_id: 'q2', is_completed: false, quest: { id: 'q2' } },
        { id: 'uq3', quest_id: 'q3', is_completed: false, quest: { id: 'q3' } },
      ],
      error: null,
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.quests).toHaveLength(3)
  })

  it('returns empty array when no daily_quests exist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockExistingQuests.mockResolvedValue({ data: [], error: null })
    mockAllQuests.mockResolvedValue({ data: [], error: null })

    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.quests).toEqual([])
  })

  it('returns 500 on insert error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockExistingQuests.mockResolvedValue({ data: [], error: null })
    mockAllQuests.mockResolvedValue({
      data: [{ id: 'q1', slug: 'play-3', is_active: true }],
      error: null,
    })
    mockInsertQuests.mockResolvedValue({ data: null, error: { code: '23503' } })

    const res = await GET()
    expect(res.status).toBe(500)
  })
})

describe('PATCH /api/quests', () => {
  it('rejects client-controlled quest progress without reading auth or writing data', async () => {
    vi.clearAllMocks()
    const res = await PATCH()

    expect(res.status).toBe(405)
    expect(res.headers.get('Allow')).toBe('GET')
    expect(mockGetUser).not.toHaveBeenCalled()
    expect(mockExistingQuests).not.toHaveBeenCalled()
    expect(mockInsertQuests).not.toHaveBeenCalled()
  })
})
