import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetUser, mockUpsert, mockDeleteChain } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUpsert: vi.fn(),
  mockDeleteChain: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn(() => ({
      upsert: mockUpsert,
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: mockDeleteChain,
        })),
      })),
    })),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({
    check: vi.fn(async () => ({ success: true })),
  })),
}))

import { POST, DELETE } from '../route'

const VALID_UUID = '12345678-1234-1234-1234-123456789012'

function makeReq(method: string) {
  const headers = new Headers()
  headers.set('x-forwarded-for', '1.2.3.4')
  return new Request('http://localhost/api/comments/x/like', { method, headers })
}

describe('POST /api/comments/[id]/like', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeReq('POST') as never, { params: Promise.resolve({ id: VALID_UUID }) })
    expect(res.status).toBe(401)
  })

  it('returns 400 if id invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeReq('POST') as never, { params: Promise.resolve({ id: 'not-uuid' }) })
    expect(res.status).toBe(400)
  })

  it('returns 200 on successful like (upsert)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockUpsert.mockResolvedValue({ error: null })
    const res = await POST(makeReq('POST') as never, { params: Promise.resolve({ id: VALID_UUID }) })
    expect(res.status).toBe(200)
  })

  it('returns 500 on db error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockUpsert.mockResolvedValue({ error: { code: '42501' } })
    const res = await POST(makeReq('POST') as never, { params: Promise.resolve({ id: VALID_UUID }) })
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/comments/[id]/like', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeReq('DELETE') as never, { params: Promise.resolve({ id: VALID_UUID }) })
    expect(res.status).toBe(401)
  })

  it('returns 200 on successful unlike', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockDeleteChain.mockResolvedValue({ error: null })
    const res = await DELETE(makeReq('DELETE') as never, { params: Promise.resolve({ id: VALID_UUID }) })
    expect(res.status).toBe(200)
  })

  it('returns 500 on db error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockDeleteChain.mockResolvedValue({ error: { code: '42501' } })
    const res = await DELETE(makeReq('DELETE') as never, { params: Promise.resolve({ id: VALID_UUID }) })
    expect(res.status).toBe(500)
  })
})
