import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────

const mockGetUser = vi.fn()
const mockQuestSingle = vi.fn()
const mockClaimSelect = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: vi.fn((table: string) => {
      if (table === 'user_daily_quests') {
        return {
          // SELECT path: .select().eq().eq().single()
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: mockQuestSingle,
              })),
            })),
          })),
          // UPDATE path: .update().eq().eq().select()
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: mockClaimSelect,
              })),
            })),
          })),
        }
      }
      if (table === 'xp_log') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: { total_xp: 100 }, error: null }),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({ error: null }),
          })),
        }
      }
      return {}
    }),
    rpc: vi.fn().mockResolvedValue({ error: null }),
  }),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({
    check: vi.fn().mockResolvedValue({ success: true }),
  }),
}))

import { POST } from '../route'

// ─── Helpers ────────────────────────────────────────

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/quests/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ─── Tests ──────────────────────────────────────────

describe('POST /api/quests/claim', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest({ questId: 'q1' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 if questId missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 404 if quest not found', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockQuestSingle.mockResolvedValue({ data: null, error: null })

    const res = await POST(makeRequest({ questId: 'q1' }))
    expect(res.status).toBe(404)
  })

  it('returns 400 if quest not completed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockQuestSingle.mockResolvedValue({
      data: { id: 'q1', is_completed: false, xp_claimed: false, quest: { xp_reward: 50 } },
      error: null,
    })

    const res = await POST(makeRequest({ questId: 'q1' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('tamamlanmadı')
  })

  it('returns 400 if XP already claimed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockQuestSingle.mockResolvedValue({
      data: { id: 'q1', is_completed: true, xp_claimed: true, quest: { xp_reward: 50 } },
      error: null,
    })

    const res = await POST(makeRequest({ questId: 'q1' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('zaten')
  })

  it('claims XP successfully', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockQuestSingle.mockResolvedValue({
      data: { id: 'q1', is_completed: true, xp_claimed: false, quest: { xp_reward: 75, slug: 'daily-3' } },
      error: null,
    })
    mockClaimSelect.mockResolvedValue({ data: [{ id: 'q1' }] })

    const res = await POST(makeRequest({ questId: 'q1' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.xp_earned).toBe(75)
  })

  it('returns 400 on race condition (double claim)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockQuestSingle.mockResolvedValue({
      data: { id: 'q1', is_completed: true, xp_claimed: false, quest: { xp_reward: 50 } },
      error: null,
    })
    mockClaimSelect.mockResolvedValue({ data: [] }) // Atomic guard catches race

    const res = await POST(makeRequest({ questId: 'q1' }))
    expect(res.status).toBe(400)
  })
})
