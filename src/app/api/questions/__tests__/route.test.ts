import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockGetUser, mockCheckAdmin, mockRangeResult, mockUpdateEq } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockCheckAdmin: vi.fn(),
  mockRangeResult: vi.fn(),
  mockUpdateEq: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          eq: vi.fn(() => ({
            range: mockRangeResult,
          })),
          range: mockRangeResult,
        })),
      })),
      update: vi.fn(() => ({
        eq: mockUpdateEq,
      })),
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          eq: vi.fn(() => ({ range: mockRangeResult })),
          range: mockRangeResult,
        })),
      })),
    })),
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  checkAdmin: mockCheckAdmin,
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({
    check: vi.fn().mockResolvedValue({ success: true }),
  }),
}))

import { GET, PATCH } from '../route'

const VALID_QID = '40000000-0000-4000-8000-000000000001'

function makeGet(url = 'http://localhost/api/questions') {
  return new NextRequest(url)
}

function makePatch(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/questions', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/questions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns question list for authenticated user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockCheckAdmin.mockResolvedValue(null)
    mockRangeResult.mockResolvedValue({
      data: [{ id: 'q1', game: 'matematik' }],
      count: 1,
      error: null,
    })

    const res = await GET(makeGet())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.questions).toHaveLength(1)
    expect(json.total).toBe(1)
  })

  it('returns 400 for invalid game slug', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockCheckAdmin.mockResolvedValue(null)

    const res = await GET(makeGet('http://localhost/api/questions?game=fake-game'))
    expect(res.status).toBe(400)
  })

  it('returns 500 on db error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockCheckAdmin.mockResolvedValue(null)
    mockRangeResult.mockResolvedValue({ data: null, count: null, error: { message: 'DB error' } })

    const res = await GET(makeGet())
    expect(res.status).toBe(500)
  })
})

describe('PATCH /api/questions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 if not admin', async () => {
    mockCheckAdmin.mockResolvedValue(null)
    const res = await PATCH(makePatch({ questionId: VALID_QID, updates: { is_active: false } }))
    expect(res.status).toBe(403)
  })

  it('returns 400 if questionId missing', async () => {
    mockCheckAdmin.mockResolvedValue({ id: 'admin-1' })
    const res = await PATCH(makePatch({ updates: { is_active: false } }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if questionId is not a UUID', async () => {
    mockCheckAdmin.mockResolvedValue({ id: 'admin-1' })
    const res = await PATCH(makePatch({ questionId: 'not-a-uuid', updates: { is_active: false } }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if no valid fields to update (all filtered)', async () => {
    mockCheckAdmin.mockResolvedValue({ id: 'admin-1' })
    const res = await PATCH(makePatch({ questionId: VALID_QID, updates: { evil_field: 'x' } }))
    expect(res.status).toBe(400)
  })

  it('updates question successfully', async () => {
    mockCheckAdmin.mockResolvedValue({ id: 'admin-1' })
    mockUpdateEq.mockResolvedValue({ error: null })

    const res = await PATCH(makePatch({ questionId: VALID_QID, updates: { is_active: false } }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })
})
