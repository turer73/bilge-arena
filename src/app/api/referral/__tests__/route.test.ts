import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
// profiles SELECT .single() sirali: 1) myProfile, 2) referrer lookup
const mockProfileSingle = vi.fn()
// profiles UPDATE .is('referred_by',null).select() -> TOCTOU kosullu guard sonucu
const mockConditionalUpdateSelect = vi.fn()
const mockRewardInsert = vi.fn()
const mockIncrementXp = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          // SELECT path: .select().eq().single()
          select: () => ({ eq: () => ({ single: mockProfileSingle }) }),
          // Conditional UPDATE path: .update().eq().is().select()
          update: () => ({ eq: () => ({ is: () => ({ select: mockConditionalUpdateSelect }) }) }),
        }
      }
      if (table === 'referral_rewards') {
        return { insert: mockRewardInsert }
      }
      return {}
    },
    rpc: mockIncrementXp,
  }),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({ check: vi.fn().mockResolvedValue({ success: true }) }),
}))

import { POST } from '../route'

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/referral', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/referral', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    // 1) myProfile: farkli kod, henuz referred degil  2) referrer: bulundu
    mockProfileSingle
      .mockResolvedValueOnce({ data: { referral_code: 'MINE', referred_by: null }, error: null })
      .mockResolvedValueOnce({ data: { id: 'referrer-1' }, error: null })
    mockConditionalUpdateSelect.mockResolvedValue({ data: [{ id: 'u1' }], error: null })
    mockRewardInsert.mockResolvedValue({ error: null })
    mockIncrementXp.mockResolvedValue({ error: null })
  })

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest({ code: 'ABC123' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 if code is empty', async () => {
    const res = await POST(makeRequest({ code: '' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if code is missing', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 if code exceeds 20 chars', async () => {
    const res = await POST(makeRequest({ code: 'a'.repeat(21) }))
    expect(res.status).toBe(400)
  })

  it('happy path: XP verilir + claimed doner', async () => {
    const res = await POST(makeRequest({ code: 'FRIEND' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('claimed')
    // Iki tarafa da increment_xp
    expect(mockIncrementXp).toHaveBeenCalledTimes(2)
  })

  // ─── TOCTOU regresyon-kilidi ──────────────────────────────────────────
  it('TOCTOU: kosullu update 0-satir donerse 409 + XP VERILMEZ', async () => {
    // Eszamanli ikinci istek: referred_by bu arada baskasi tarafindan set edildi
    // -> .is('referred_by',null) guard 0 satir doner
    mockConditionalUpdateSelect.mockResolvedValue({ data: [], error: null })
    const res = await POST(makeRequest({ code: 'FRIEND' }))
    expect(res.status).toBe(409)
    // Kritik: odul kaydi + XP CAGRILMAMALI (cift-XP onlendi)
    expect(mockRewardInsert).not.toHaveBeenCalled()
    expect(mockIncrementXp).not.toHaveBeenCalled()
  })

  it('kendi kodunu kullanamaz (400)', async () => {
    mockProfileSingle.mockReset()
    mockProfileSingle.mockResolvedValueOnce({ data: { referral_code: 'MINE', referred_by: null }, error: null })
    const res = await POST(makeRequest({ code: 'MINE' }))
    expect(res.status).toBe(400)
  })

  it('zaten referred ise 409', async () => {
    mockProfileSingle.mockReset()
    mockProfileSingle.mockResolvedValueOnce({ data: { referral_code: 'MINE', referred_by: 'someone' }, error: null })
    const res = await POST(makeRequest({ code: 'FRIEND' }))
    expect(res.status).toBe(409)
  })
})
