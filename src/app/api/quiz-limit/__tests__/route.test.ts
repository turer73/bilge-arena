import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Supabase mock ──────────────────────────────────

const mockGetUser = vi.fn()
const mockProfileSingle = vi.fn()
const mockSessionCount = vi.fn()

const mockFrom = vi.fn((table: string) => {
  if (table === 'profiles') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: mockProfileSingle,
        })),
      })),
    }
  }
  if (table === 'game_sessions') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          gte: mockSessionCount,
        })),
      })),
    }
  }
  return {}
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}))

// ─── Import after mock ──────────────────────────────

import { GET } from '../route'

// ─── Tests ──────────────────────────────────────────

describe('GET /api/quiz-limit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns guest response if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await GET()
    const json = await res.json()

    expect(json.isGuest).toBe(true)
    expect(json.used).toBe(0)
    expect(json.limit).toBeGreaterThan(0)
  })

  it('returns unlimited for premium users', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfileSingle.mockResolvedValue({
      data: { is_premium: true, premium_until: '2027-01-01T00:00:00.000Z' },
    })

    const res = await GET()
    const json = await res.json()

    expect(json.isPremium).toBe(true)
    expect(json.limit).toBe(-1)
  })

  it('returns usage count for free users', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfileSingle.mockResolvedValue({
      data: { is_premium: false, premium_until: null },
    })
    mockSessionCount.mockResolvedValue({ count: 3 })

    const res = await GET()
    const json = await res.json()

    expect(json.isPremium).toBe(false)
    expect(json.isGuest).toBe(false)
    expect(json.used).toBe(3)
    expect(json.remaining).toBeGreaterThanOrEqual(0)
  })

  it('treats expired premium as free user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfileSingle.mockResolvedValue({
      data: { is_premium: true, premium_until: '2020-01-01T00:00:00.000Z' },
    })
    mockSessionCount.mockResolvedValue({ count: 0 })

    const res = await GET()
    const json = await res.json()

    expect(json.isPremium).toBe(false)
  })
})
