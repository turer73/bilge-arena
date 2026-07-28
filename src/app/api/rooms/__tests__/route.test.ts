import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// ─── Hoisted mocks ───────────────────────────────────

const {
  mockGetAuthRateLimited,
  mockCreateRateLimiter,
  mockCallRpc,
} = vi.hoisted(() => ({
  mockGetAuthRateLimited: vi.fn(),
  mockCreateRateLimiter: vi.fn((name: string, limit: number, windowMs: number) => ({
    name,
    limit,
    windowMs,
    check: vi.fn(),
  })),
  mockCallRpc: vi.fn(),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: mockCreateRateLimiter,
}))

vi.mock('@/lib/rooms/api-helpers', () => ({
  getAuthRateLimited: mockGetAuthRateLimited,
}))

vi.mock('@/lib/rooms/client', () => ({
  callRpc: mockCallRpc,
}))

import { POST, GET } from '../route'

// ─── Helpers ────────────────────────────────────────

function makePost(body: unknown) {
  return new Request('http://localhost/api/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const VALID_BODY = {
  title: 'Test Odasi',
  category: 'matematik',
  difficulty: 1,
  question_count: 5,
  max_players: 4,
  per_question_seconds: 20,
  mode: 'sync',
}

// ─── Tests ──────────────────────────────────────────

describe('GET /api/rooms', () => {
  it('returns 501 not implemented', async () => {
    const res = await GET()
    expect(res.status).toBe(501)
  })
})

describe('POST /api/rooms', () => {
  beforeEach(() => {
    mockGetAuthRateLimited.mockClear()
    mockCallRpc.mockClear()
    mockGetAuthRateLimited.mockResolvedValue({ ok: true, userId: 'u1', jwt: 'jwt-token' })
  })

  it('returns the IP-first helper 401 when not authenticated', async () => {
    mockGetAuthRateLimited.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Yetkisiz' }, { status: 401 }),
    })
    const res = await POST(makePost(VALID_BODY))
    expect(res.status).toBe(401)
  })

  it('returns the IP-first helper 429 with Retry-After', async () => {
    mockGetAuthRateLimited.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Cok hizli istek' }, {
        status: 429,
        headers: { 'Retry-After': '60' },
      }),
    })
    const res = await POST(makePost(VALID_BODY))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
    expect(mockCallRpc).not.toHaveBeenCalled()
  })

  it('returns 400 on validation error (missing required fields)', async () => {
    const res = await POST(makePost({ title: 'Eksik' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 on invalid JSON body', async () => {
    const req = new Request('http://localhost/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns the helper 401 if session token missing (JWT expired)', async () => {
    mockGetAuthRateLimited.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'JWT alinamadi' }, { status: 401 }),
    })
    const res = await POST(makePost(VALID_BODY))
    expect(res.status).toBe(401)
  })

  it('returns 201 on successful room creation', async () => {
    mockCallRpc.mockResolvedValue({
      ok: true,
      data: { id: 'room-uuid', code: 'ABC123' },
    })

    const res = await POST(makePost(VALID_BODY))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.id).toBe('room-uuid')
    expect(json.code).toBe('ABC123')
    expect(mockGetAuthRateLimited).toHaveBeenCalledWith(
      expect.any(Request),
      expect.any(Object),
      expect.any(Object),
    )
    expect(mockCreateRateLimiter).toHaveBeenCalledWith('rooms-create-ip', 20, 60_000)
    expect(mockCreateRateLimiter).toHaveBeenCalledWith('rooms-create-user', 5, 60_000)
  })

  it('propagates RPC error status code', async () => {
    mockCallRpc.mockResolvedValue({
      ok: false,
      error: { code: 'P0002', message: 'Kategori bulunamadi', status: 404 },
    })

    const res = await POST(makePost(VALID_BODY))
    expect(res.status).toBe(404)
  })
})
