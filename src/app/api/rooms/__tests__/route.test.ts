import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Hoisted mocks ───────────────────────────────────

const {
  mockGetUser,
  mockGetSession,
  mockRateLimitCheck,
  mockCallRpc,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockGetSession: vi.fn(),
  mockRateLimitCheck: vi.fn(async () => ({ success: true })),
  mockCallRpc: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
      getSession: mockGetSession,
    },
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({ check: mockRateLimitCheck })),
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
    vi.clearAllMocks()
    mockRateLimitCheck.mockResolvedValue({ success: true })
    mockGetSession.mockResolvedValue({ data: { session: { access_token: 'jwt-token' } } })
  })

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await POST(makePost(VALID_BODY))
    expect(res.status).toBe(401)
  })

  it('returns 429 on rate limit (H4 abuse)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mockRateLimitCheck.mockResolvedValueOnce({ success: false, retryAfter: 60 } as never)
    const res = await POST(makePost(VALID_BODY))
    expect(res.status).toBe(429)
  })

  it('returns 400 on validation error (missing required fields)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const res = await POST(makePost({ title: 'Eksik' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 on invalid JSON body', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    const req = new Request('http://localhost/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 401 if session token missing (JWT expired)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: null } })
    const res = await POST(makePost(VALID_BODY))
    expect(res.status).toBe(401)
  })

  it('returns 201 on successful room creation', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mockCallRpc.mockResolvedValue({
      ok: true,
      data: { id: 'room-uuid', code: 'ABC123' },
    })

    const res = await POST(makePost(VALID_BODY))
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.id).toBe('room-uuid')
    expect(json.code).toBe('ABC123')
  })

  it('propagates RPC error status code', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    mockCallRpc.mockResolvedValue({
      ok: false,
      error: { code: 'P0002', message: 'Kategori bulunamadi', status: 404 },
    })

    const res = await POST(makePost(VALID_BODY))
    expect(res.status).toBe(404)
  })
})
