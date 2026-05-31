import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ──────────────────────────────────────────
const mockGetUser = vi.fn()
const mockRpc = vi.fn()
const mockSelectSingle = vi.fn()

const mockFrom = vi.fn(() => ({
  select: vi.fn(() => ({
    eq: vi.fn(() => ({
      single: mockSelectSingle,
    })),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({
    check: vi.fn().mockResolvedValue({ success: true }),
  }),
}))

vi.mock('@/lib/utils/client-ip', () => ({
  getClientIp: () => '1.2.3.4',
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    rpc: mockRpc,
    from: mockFrom,
  }),
}))

// ─── Import after mocks ─────────────────────────────
import { POST } from '../route'
import type { NextRequest } from 'next/server'

function makeReq(body: unknown): NextRequest {
  return {
    json: async () => body,
    headers: new Headers(),
  } as unknown as NextRequest
}

describe('POST /api/profile/frames/purchase (atomic TOCTOU fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeReq({ frameId: 'alev' }))
    expect(res.status).toBe(401)
  })

  it('404 for unknown frame', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeReq({ frameId: 'nonexistent' }))
    expect(res.status).toBe(404)
  })

  it('200 on atomic purchase — single purchase_frame RPC returns a row', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({
      data: [{ new_balance: 70, new_owned: ['none', 'mavi', 'alev'] }],
      error: null,
    })

    const res = await POST(makeReq({ frameId: 'alev' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.frameId).toBe('alev')
    expect(json.coin_balance).toBe(70)
    // Tek atomik RPC cagrildi (TOCTOU yok): ownership+debit+append tek statement
    expect(mockRpc).toHaveBeenCalledWith('purchase_frame', {
      p_user_id: 'u1',
      p_frame_id: 'alev',
      p_cost: 30,
    })
  })

  it('400 when already owned — RPC 0 rows + profile has the frame', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [], error: null })
    mockSelectSingle.mockResolvedValue({
      data: { coin_balance: 100, owned_frames: ['none', 'mavi', 'alev'] },
    })

    const res = await POST(makeReq({ frameId: 'alev' }))
    expect(res.status).toBe(400)
  })

  it('402 when insufficient coins — RPC 0 rows + profile lacks frame', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [], error: null })
    mockSelectSingle.mockResolvedValue({
      data: { coin_balance: 5, owned_frames: ['none', 'mavi'] },
    })

    const res = await POST(makeReq({ frameId: 'alev' }))
    expect(res.status).toBe(402)
  })

  it('500 on RPC error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'db down' } })

    const res = await POST(makeReq({ frameId: 'alev' }))
    expect(res.status).toBe(500)
  })
})
