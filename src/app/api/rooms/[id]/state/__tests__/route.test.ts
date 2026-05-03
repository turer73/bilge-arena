/**
 * GET /api/rooms/[id]/state — full lobby state hydrate endpoint
 * Sprint 1 PR4b Task 5
 *
 * 6 senaryo:
 *   15) auth fail → 401
 *   16) fetchRoomState null (RLS empty / not found) → 404
 *   17) success → 200 + full payload
 *   18) fetchRoomState called with (jwt, roomId)
 *   19) lobby state → current_round null
 *   20) scoreboard placeholder [] (4c'de doldurulur)
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { mockGetAuth, mockFetchRoomState } = vi.hoisted(() => ({
  mockGetAuth: vi.fn(),
  mockFetchRoomState: vi.fn(),
}))

vi.mock('@/lib/rooms/api-helpers', () => ({ getAuthRateLimited: mockGetAuth }))
vi.mock('@/lib/rooms/server-fetch', () => ({
  fetchRoomState: mockFetchRoomState,
}))
// Rate limit mock — her zaman success doner (rate limit logic ayri test edilir)
vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({
    check: vi.fn(async () => ({ success: true, retryAfter: 0 })),
  })),
}))

import { GET } from '../route'

const params = { params: Promise.resolve({ id: 'r1' }) }
const req = () => new NextRequest('http://localhost/api/rooms/r1/state')

describe('GET /api/rooms/[id]/state', () => {
  beforeEach(() => vi.clearAllMocks())

  test('15) auth fail -> 401', async () => {
    mockGetAuth.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Yetkisiz' }, { status: 401 }),
    })
    const res = await GET(req(), params)
    expect(res.status).toBe(401)
  })

  test('16) fetchRoomState null -> 404', async () => {
    mockGetAuth.mockResolvedValue({ ok: true, userId: 'u1', jwt: 'jwt' })
    mockFetchRoomState.mockResolvedValue(null)
    const res = await GET(req(), params)
    expect(res.status).toBe(404)
  })

  test('17) success -> 200 + full payload', async () => {
    mockGetAuth.mockResolvedValue({ ok: true, userId: 'u1', jwt: 'jwt' })
    const payload = {
      room: { id: 'r1', code: 'BLZGE2', state: 'lobby' },
      members: [],
      current_round: null,
      answers_count: 0,
      scoreboard: [],
    }
    mockFetchRoomState.mockResolvedValue(payload)
    const res = await GET(req(), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(payload)
  })

  test('18) fetchRoomState called with (jwt, roomId)', async () => {
    mockGetAuth.mockResolvedValue({ ok: true, userId: 'u1', jwt: 'jwt' })
    mockFetchRoomState.mockResolvedValue({
      room: { id: 'r1' },
      members: [],
      current_round: null,
      answers_count: 0,
      scoreboard: [],
    })
    await GET(req(), params)
    // PR4f: userId param eklendi (my_answer query icin)
    expect(mockFetchRoomState).toHaveBeenCalledWith('jwt', 'r1', 'u1')
  })

  test('19) lobby state -> current_round null', async () => {
    mockGetAuth.mockResolvedValue({ ok: true, userId: 'u1', jwt: 'jwt' })
    mockFetchRoomState.mockResolvedValue({
      room: { state: 'lobby' },
      members: [],
      current_round: null,
      answers_count: 0,
      scoreboard: [],
    })
    const res = await GET(req(), params)
    expect((await res.json()).current_round).toBeNull()
  })

  test('20) scoreboard placeholder [] (4c populates)', async () => {
    mockGetAuth.mockResolvedValue({ ok: true, userId: 'u1', jwt: 'jwt' })
    mockFetchRoomState.mockResolvedValue({
      room: {},
      members: [],
      current_round: null,
      answers_count: 0,
      scoreboard: [],
    })
    const res = await GET(req(), params)
    expect((await res.json()).scoreboard).toEqual([])
  })
})
