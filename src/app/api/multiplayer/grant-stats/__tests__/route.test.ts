import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const mockRpc = vi.fn()
const { mockRateCheck, mockGetAuthAndJwt, mockVerify } = vi.hoisted(() => ({
  mockRateCheck: vi.fn().mockResolvedValue({ success: true }),
  mockGetAuthAndJwt: vi.fn(),
  mockVerify: vi.fn(),
}))

vi.mock('@/lib/rooms/api-helpers', () => ({
  getAuthAndJwt: mockGetAuthAndJwt,
}))

vi.mock('@/lib/rooms/server-fetch', () => ({
  verifyRoomFirstPlace: mockVerify,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({ rpc: mockRpc })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({ check: mockRateCheck }),
}))

import { POST } from '../route'

function makeReq(body: unknown): Request {
  return new Request('http://localhost/api/multiplayer/grant-stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const OK_AUTH = { ok: true, userId: 'u1', jwt: 'jwt-token' }
const ROOM = '3f2a9c1e-7b4d-4e8a-9c21-5d6e7f8a9b0c'
const ROOM2 = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

describe('POST /api/multiplayer/grant-stats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRateCheck.mockResolvedValue({ success: true })
    mockGetAuthAndJwt.mockResolvedValue(OK_AUTH)
    // Varsayilan: oda tamamlanmis, caller birinci degil
    mockVerify.mockResolvedValue({ finished: true, isFirstPlace: false })
    mockRpc.mockResolvedValue({
      data: { granted: true, rooms_completed: 1, multiplayer_wins: 0, multiplayer_firsts: 0 },
      error: null,
    })
  })

  it('returns 401 if not authenticated', async () => {
    mockGetAuthAndJwt.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Yetkisiz' }, { status: 401 }),
    })
    const res = await POST(makeReq({ roomId: ROOM }))
    expect(res.status).toBe(401)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns 429 when rate limit exceeded', async () => {
    mockRateCheck.mockResolvedValueOnce({ success: false })
    const res = await POST(makeReq({ roomId: ROOM }))
    expect(res.status).toBe(429)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns 400 for malformed JSON body', async () => {
    const req = new Request('http://localhost/api/multiplayer/grant-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not valid json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns 400 for missing roomId', async () => {
    const res = await POST(makeReq({ isFirstPlace: true }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid roomId type', async () => {
    const res = await POST(makeReq({ roomId: 123 }))
    expect(res.status).toBe(400)
  })

  // ─── Tekrar koruması: aynı UUID'nin farklı yazımları tek kayıt ─────────
  it('tiresiz, süslü parantezli, parametre taşıyan ve UUID olmayan kimliği 400 ile reddeder', async () => {
    for (const roomId of [ROOM.replaceAll('-', ''), `{${ROOM}}`, `${ROOM}&limit=1`, 'r1', '']) {
      const res = await POST(makeReq({ roomId }))
      expect(res.status, roomId).toBe(400)
    }
    expect(mockVerify).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('büyük ve karışık harfli yazımı kanonik küçük harfe indirip doğrulama ve RPC\'ye geçirir', async () => {
    const mixed = ROOM.split('').map((ch, i) => (i % 2 ? ch.toUpperCase() : ch)).join('')
    for (const roomId of [ROOM.toUpperCase(), mixed]) {
      await POST(makeReq({ roomId }))
    }
    for (const call of mockVerify.mock.calls) expect(call[1]).toBe(ROOM)
    for (const call of mockRpc.mock.calls) expect(call[1].p_room_id).toBe(ROOM)
    expect(mockRpc).toHaveBeenCalledTimes(2)
  })

  // ─── Yeni davranis: server-side dogrulama ──────────────────────────────
  it('returns 400 if room not finished (verify fail) — RPC cagrilmaz', async () => {
    mockVerify.mockResolvedValue({ finished: false, isFirstPlace: false })
    const res = await POST(makeReq({ roomId: ROOM, isFirstPlace: true }))
    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('SERVER-AUTHORITY: client isFirstPlace yok sayilir — server degeri RPC\'ye gider', async () => {
    // Client 'true' iddia ediyor AMA server 'false' dogruladi
    mockVerify.mockResolvedValue({ finished: true, isFirstPlace: false })
    await POST(makeReq({ roomId: ROOM, isFirstPlace: true }))
    expect(mockVerify).toHaveBeenCalledWith('jwt-token', ROOM, 'u1')
    expect(mockRpc).toHaveBeenCalledWith('grant_multiplayer_stats', {
      p_user_id: 'u1',
      p_room_id: ROOM,
      p_first_place: false, // client 'true' dedi ama server 'false'
    })
  })

  it('server birinci dogrularsa p_first_place=true gider', async () => {
    mockVerify.mockResolvedValue({ finished: true, isFirstPlace: true })
    // Client isFirstPlace hic gondermese bile server belirler
    await POST(makeReq({ roomId: ROOM2 }))
    expect(mockRpc).toHaveBeenCalledWith('grant_multiplayer_stats', {
      p_user_id: 'u1',
      p_room_id: ROOM2,
      p_first_place: true,
    })
  })

  it('returns 500 if RPC errors', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc fail' } })
    const res = await POST(makeReq({ roomId: ROOM }))
    expect(res.status).toBe(500)
  })

  it('grants stats and returns ok+stats on RPC success', async () => {
    const res = await POST(makeReq({ roomId: ROOM }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.stats.granted).toBe(true)
  })

  it('returns ok with granted=false for already-synced room', async () => {
    mockRpc.mockResolvedValue({
      data: { granted: false, reason: 'already_synced', rooms_completed: 5, multiplayer_wins: 2, multiplayer_firsts: 1 },
      error: null,
    })
    const res = await POST(makeReq({ roomId: ROOM }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stats.granted).toBe(false)
    expect(body.stats.reason).toBe('already_synced')
  })
})
