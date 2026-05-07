import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
const mockRpc = vi.fn()
const { mockRateCheck } = vi.hoisted(() => ({
  mockRateCheck: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({}),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({
    check: mockRateCheck,
  }),
}))

import { POST } from '../route'

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/multiplayer/grant-stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/multiplayer/grant-stats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRateCheck.mockResolvedValue({ success: true })
  })

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeReq({ roomId: 'r1', isFirstPlace: false }))
    expect(res.status).toBe(401)
  })

  it('returns 429 when rate limit exceeded', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRateCheck.mockResolvedValueOnce({ success: false })
    const res = await POST(makeReq({ roomId: 'r1', isFirstPlace: false }))
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toMatch(/cok fazla/i)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns 400 for malformed JSON body', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const req = new Request('http://localhost/api/multiplayer/grant-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not valid json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/json/i)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid body (missing fields)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeReq({ roomId: 'r1' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid roomId type', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeReq({ roomId: 123, isFirstPlace: true }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid isFirstPlace type', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeReq({ roomId: 'r1', isFirstPlace: 'yes' }))
    expect(res.status).toBe(400)
  })

  it('returns 500 if RPC errors', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc fail' } })
    const res = await POST(makeReq({ roomId: 'r1', isFirstPlace: false }))
    expect(res.status).toBe(500)
  })

  it('grants stats and returns ok+stats on RPC success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({
      data: {
        granted: true,
        rooms_completed: 1,
        multiplayer_wins: 0,
        multiplayer_firsts: 0,
      },
      error: null,
    })
    const res = await POST(makeReq({ roomId: 'r1', isFirstPlace: false }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      ok: true,
      stats: {
        granted: true,
        rooms_completed: 1,
        multiplayer_wins: 0,
        multiplayer_firsts: 0,
      },
    })
    expect(mockRpc).toHaveBeenCalledWith('grant_multiplayer_stats', {
      p_room_id: 'r1',
      p_first_place: false,
    })
  })

  it('returns ok with granted=false for already-synced room', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({
      data: {
        granted: false,
        reason: 'already_synced',
        rooms_completed: 5,
        multiplayer_wins: 2,
        multiplayer_firsts: 1,
      },
      error: null,
    })
    const res = await POST(makeReq({ roomId: 'r1', isFirstPlace: true }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stats.granted).toBe(false)
    expect(body.stats.reason).toBe('already_synced')
  })

  it('passes isFirstPlace=true to RPC', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({
      data: { granted: true, rooms_completed: 1, multiplayer_wins: 1, multiplayer_firsts: 1 },
      error: null,
    })
    await POST(makeReq({ roomId: 'abc-123', isFirstPlace: true }))
    expect(mockRpc).toHaveBeenCalledWith('grant_multiplayer_stats', {
      p_room_id: 'abc-123',
      p_first_place: true,
    })
  })
})
