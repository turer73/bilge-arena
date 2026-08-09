import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetUser, mockRpc } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ rpc: mockRpc }),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({
    check: vi.fn().mockResolvedValue({ success: true }),
  }),
}))

import { POST } from '../route'

const QUEST_ID = '10000000-0000-4000-8000-000000000001'

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/quests/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/quests/claim', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({
      data: { xpEarned: 75, coinsEarned: 15, alreadyProcessed: false },
      error: null,
    })
  })

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    expect((await POST(makeRequest({ questId: QUEST_ID }))).status).toBe(401)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns 400 if questId is missing or not a UUID', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    expect((await POST(makeRequest({}))).status).toBe(400)
    expect((await POST(makeRequest({ questId: 'not-a-uuid' }))).status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('claims XP and coins only through the atomic RPC', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    const res = await POST(makeRequest({ questId: QUEST_ID }))

    expect(res.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledOnce()
    expect(mockRpc).toHaveBeenCalledWith('claim_daily_quest_reward', {
      p_user_id: 'u1',
      p_user_quest_id: QUEST_ID,
    })
    expect(await res.json()).toEqual({
      success: true,
      xp_earned: 75,
      coins_earned: 15,
      already_processed: false,
    })
  })

  it('returns the deterministic replay result without another app-side write', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({
      data: { xpEarned: 75, coinsEarned: 15, alreadyProcessed: true },
      error: null,
    })

    const res = await POST(makeRequest({ questId: QUEST_ID }))

    expect(res.status).toBe(200)
    expect((await res.json()).already_processed).toBe(true)
    expect(mockRpc).toHaveBeenCalledOnce()
  })

  it.each([
    ['P0002', 404],
    ['42501', 403],
    ['22023', 400],
    ['XX000', 500],
  ])('maps PostgreSQL error %s to HTTP %i', async (code, status) => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: null, error: { code } })

    expect((await POST(makeRequest({ questId: QUEST_ID }))).status).toBe(status)
  })

  it('fails closed when the RPC returns an invalid payload', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: { xpEarned: 75 }, error: null })

    expect((await POST(makeRequest({ questId: QUEST_ID }))).status).toBe(500)
  })
})
