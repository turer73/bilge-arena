import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Supabase mock ──────────────────────────────────

const mockGetUser = vi.fn()
const mockSelectSingle = vi.fn()
const mockUpdateSelect = vi.fn()
const mockUpdate = vi.fn(() => ({
  eq: vi.fn(() => ({
    or: vi.fn(() => ({
      select: mockUpdateSelect,
    })),
  })),
}))
const mockInsertThen = vi.fn()

const mockFrom = vi.fn((table: string) => {
  if (table === 'profiles') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: mockSelectSingle,
        })),
      })),
      update: mockUpdate,
    }
  }
  if (table === 'xp_log') {
    return { insert: vi.fn(() => ({ then: mockInsertThen })) }
  }
  return { insert: vi.fn() }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}))

// ─── Import after mock ──────────────────────────────

import { POST } from '../route'

// ─── Tests ──────────────────────────────────────────

describe('POST /api/daily-login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-29T10:00:00.000Z'))
  })

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('returns already_claimed if played today', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSelectSingle.mockResolvedValue({
      data: { current_streak: 3, last_played_at: '2026-03-29T08:00:00.000Z', total_xp: 100 },
    })

    const res = await POST()
    const json = await res.json()

    expect(json.status).toBe('already_claimed')
    expect(json.xpAwarded).toBe(0)
    expect(json.streak).toBe(3)
  })

  it('continues streak if played yesterday', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSelectSingle.mockResolvedValue({
      data: { current_streak: 5, last_played_at: '2026-03-28T15:00:00.000Z', total_xp: 500 },
    })
    mockUpdateSelect.mockResolvedValue({ data: [{ id: 'u1' }], error: null })
    mockInsertThen.mockImplementation((cb: () => void) => { cb?.() })

    const res = await POST()
    const json = await res.json()

    expect(json.status).toBe('claimed')
    expect(json.streak).toBe(6)
    expect(json.xpAwarded).toBe(60) // min(6*10, 70) = 60
  })

  it('resets streak if gap > 1 day', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSelectSingle.mockResolvedValue({
      data: { current_streak: 10, last_played_at: '2026-03-27T15:00:00.000Z', total_xp: 1000 },
    })
    mockUpdateSelect.mockResolvedValue({ data: [{ id: 'u1' }], error: null })
    mockInsertThen.mockImplementation((cb: () => void) => { cb?.() })

    const res = await POST()
    const json = await res.json()

    expect(json.status).toBe('streak_reset')
    expect(json.streak).toBe(1)
    expect(json.xpAwarded).toBe(10) // 1*10
  })

  it('caps XP at 70 for 7+ day streak', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSelectSingle.mockResolvedValue({
      data: { current_streak: 9, last_played_at: '2026-03-28T15:00:00.000Z', total_xp: 2000 },
    })
    mockUpdateSelect.mockResolvedValue({ data: [{ id: 'u1' }], error: null })
    mockInsertThen.mockImplementation((cb: () => void) => { cb?.() })

    const res = await POST()
    const json = await res.json()

    expect(json.streak).toBe(10)
    expect(json.xpAwarded).toBe(70) // min(10*10, 70) = 70 (capped)
  })

  it('handles race condition — concurrent claim returns already_claimed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSelectSingle.mockResolvedValue({
      data: { current_streak: 3, last_played_at: '2026-03-28T08:00:00.000Z', total_xp: 100 },
    })
    // Atomic guard: update returns 0 rows (another request already claimed)
    mockUpdateSelect.mockResolvedValue({ data: [], error: null })

    const res = await POST()
    const json = await res.json()

    expect(json.status).toBe('already_claimed')
    expect(json.xpAwarded).toBe(0)
  })
})
