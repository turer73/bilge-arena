import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRateLimitCheck } = vi.hoisted(() => ({
  mockRateLimitCheck: vi.fn(async () => ({ success: true })),
}))

const mockGetUser = vi.fn()
const mockEarnedSelect = vi.fn()
const mockProfileSingle = vi.fn()
const mockQuestsCount = vi.fn()
const mockExistingBadges = vi.fn()
const mockBadgeInsert = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    })),
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: vi.fn((table: string) => {
      if (table === 'user_achievements') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => {
              // Two paths call this — earned list and existingBadges
              // Use call count heuristic: first call returns earned, second returns existing codes
              return mockEarnedSelect()
            }),
          })),
          insert: mockBadgeInsert,
        }
      }
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: mockProfileSingle })),
          })),
        }
      }
      if (table === 'user_daily_quests') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => mockQuestsCount()),
            })),
          })),
        }
      }
      if (table === 'xp_log') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }
      return {}
    }),
    rpc: vi.fn().mockResolvedValue({ error: null }),
  }),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({ check: mockRateLimitCheck })),
}))

import { GET, POST } from '../route'

describe('GET /api/badges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExistingBadges.mockClear()
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

  it('returns earned badges list', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockEarnedSelect.mockResolvedValue({
      data: [{ achievement_id: 'first_win', earned_at: '2025-01-01' }],
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.earned).toHaveLength(1)
    expect(json.earnedCodes).toContain('first_win')
  })
})

describe('POST /api/badges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRateLimitCheck.mockResolvedValue({ success: true })
  })

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('returns 429 on rate limit (H4 abuse)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRateLimitCheck.mockResolvedValueOnce({ success: false, retryAfter: 30 } as never)
    const res = await POST()
    expect(res.status).toBe(429)
  })

  it('returns 404 if profile missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfileSingle.mockResolvedValue({ data: null })

    const res = await POST()
    expect(res.status).toBe(404)
  })

  it('returns empty when no new badges earned', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfileSingle.mockResolvedValue({
      data: { total_xp: 0, total_sessions: 0, correct_answers: 0, longest_streak: 0, current_streak: 0 },
    })
    mockQuestsCount.mockResolvedValue({ count: 0 })
    mockEarnedSelect.mockResolvedValue({ data: [] })

    const res = await POST()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.newBadges).toEqual([])
    expect(json.totalXPEarned).toBe(0)
  })

  it('awards login_7 badge when current_streak >= 7', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfileSingle.mockResolvedValue({
      data: { total_xp: 0, total_sessions: 0, correct_answers: 0, longest_streak: 0, current_streak: 7 },
    })
    mockQuestsCount.mockResolvedValue({ count: 0 })
    // first call: existingBadges (boş), ikinci çağrı insert sonrası bir şey olmaz
    mockEarnedSelect
      .mockResolvedValueOnce({ data: [] })  // existing badges
      .mockResolvedValueOnce({ data: [] })  // (varsa ikinci select)
    mockBadgeInsert.mockResolvedValue({ error: null })

    const res = await POST()
    expect(res.status).toBe(200)
    const json = await res.json()
    const codes = json.newBadges.map((b: { code: string }) => b.code)
    expect(codes).toContain('login_7')
    expect(json.totalXPEarned).toBeGreaterThan(0)
  })
})
