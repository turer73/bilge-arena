import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetUser, mockUpdateChain } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUpdateChain: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: mockUpdateChain,
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

import { DELETE } from '../route'

const VALID_UUID = '12345678-1234-1234-1234-123456789012'

function makeReq() {
  const headers = new Headers()
  headers.set('x-forwarded-for', '1.2.3.4')
  return new Request('http://localhost/api/comments/x', { method: 'DELETE', headers })
}

describe('DELETE /api/comments/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(makeReq() as never, { params: Promise.resolve({ id: VALID_UUID }) })
    expect(res.status).toBe(401)
  })

  it('returns 400 if id invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await DELETE(makeReq() as never, { params: Promise.resolve({ id: 'not-uuid' }) })
    expect(res.status).toBe(400)
  })

  it('returns 404 if comment not owned by user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockUpdateChain.mockResolvedValue({ error: null, count: 0 })
    const res = await DELETE(makeReq() as never, { params: Promise.resolve({ id: VALID_UUID }) })
    expect(res.status).toBe(404)
  })

  it('returns 200 on successful soft delete', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockUpdateChain.mockResolvedValue({ error: null, count: 1 })
    const res = await DELETE(makeReq() as never, { params: Promise.resolve({ id: VALID_UUID }) })
    expect(res.status).toBe(200)
  })

  it('returns 500 on db error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockUpdateChain.mockResolvedValue({ error: { code: '42501' }, count: null })
    const res = await DELETE(makeReq() as never, { params: Promise.resolve({ id: VALID_UUID }) })
    expect(res.status).toBe(500)
  })
})
