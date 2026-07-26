import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockRateLimitCheck } = vi.hoisted(() => ({
  mockRateLimitCheck: vi.fn(async () => ({ success: true })),
}))

const mockGetUser = vi.fn()
const mockEarnedSelect = vi.fn()
const mockProfileSingle = vi.fn()
const mockQuestsCount = vi.fn()
const mockRpc = vi.fn()

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
          select: vi.fn(() => ({ eq: vi.fn(() => mockEarnedSelect()) })),
        }
      }
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ single: mockProfileSingle })) })),
        }
      }
      if (table === 'user_daily_quests') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ eq: vi.fn(() => mockQuestsCount()) })),
          })),
        }
      }
      return { select: vi.fn(() => ({ eq: vi.fn() })) }
    }),
    rpc: mockRpc,
  }),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({ check: mockRateLimitCheck })),
}))

import { GET, POST } from '../route'

describe('GET /api/badges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRateLimitCheck.mockResolvedValue({ success: true })
  })

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    expect((await GET()).status).toBe(401)
  })

  it('returns 429 on rate limit', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRateLimitCheck.mockResolvedValueOnce({ success: false, retryAfter: 30 } as never)
    expect((await GET()).status).toBe(429)
  })

  it('returns the earned badges list', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockEarnedSelect.mockResolvedValue({ data: [{ achievement_id: 'first_win', earned_at: '2025-01-01' }] })

    const json = await (await GET()).json()
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
    expect((await POST()).status).toBe(401)
  })

  it('returns 429 on rate limit', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRateLimitCheck.mockResolvedValueOnce({ success: false, retryAfter: 30 } as never)
    expect((await POST()).status).toBe(429)
  })

  it('returns 404 if profile is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfileSingle.mockResolvedValue({ data: null })
    expect((await POST()).status).toBe(404)
  })

  it('returns empty when no new badges are earned', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfileSingle.mockResolvedValue({
      data: { total_xp: 0, total_sessions: 0, correct_answers: 0, longest_streak: 0, current_streak: 0 },
    })
    mockQuestsCount.mockResolvedValue({ count: 0 })
    mockEarnedSelect.mockResolvedValue({ data: [] })

    expect(await (await POST()).json()).toMatchObject({ newBadges: [], totalXPEarned: 0 })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('uses the atomic RPC contract for a newly earned badge', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfileSingle.mockResolvedValue({
      data: { total_xp: 0, total_sessions: 0, correct_answers: 0, longest_streak: 0, current_streak: 7 },
    })
    mockQuestsCount.mockResolvedValue({ count: 0 })
    mockEarnedSelect.mockResolvedValue({ data: [] })
    mockRpc.mockResolvedValue({
      data: [{ awarded_codes: ['login_7'], total_xp_earned: 150 }],
      error: null,
    })

    const json = await (await POST()).json()
    expect(json).toMatchObject({ totalXPEarned: 150 })
    expect(json.newBadges.map((badge: { code: string }) => badge.code)).toEqual(['login_7'])
    expect(mockRpc).toHaveBeenCalledWith('award_badges', {
      p_user_id: 'u1',
      p_badge_codes: ['login_7'],
    })
  })

  it('returns no badge or XP when a concurrent request won the insert', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfileSingle.mockResolvedValue({
      data: { total_xp: 0, total_sessions: 0, correct_answers: 0, longest_streak: 0, current_streak: 7 },
    })
    mockQuestsCount.mockResolvedValue({ count: 0 })
    mockEarnedSelect.mockResolvedValue({ data: [] })
    mockRpc.mockResolvedValue({
      data: [{ awarded_codes: [], total_xp_earned: 0 }],
      error: null,
    })

    expect(await (await POST()).json()).toMatchObject({ newBadges: [], totalXPEarned: 0 })
  })
})
