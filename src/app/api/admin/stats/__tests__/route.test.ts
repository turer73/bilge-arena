import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCheckPermission, mockCount } = vi.hoisted(() => ({
  mockCheckPermission: vi.fn(),
  mockCount: vi.fn(),
}))

// User-scoped client — sadece auth/permission icin kullaniliyor.
// Count sorgulari ona degil service-role'e gidiyor.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
  })),
}))

// Service-role client — RLS bypass'li, gercek count sorgulari burada.
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        is: vi.fn(() => mockCount()),
        eq: vi.fn(() => mockCount()),
        head: true,
        then: (resolve: (v: unknown) => void) => resolve(mockCount()),
      })),
    })),
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  checkPermission: mockCheckPermission,
}))

import { GET } from '../route'

describe('GET /api/admin/stats', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 if no admin permission', async () => {
    mockCheckPermission.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('returns aggregate stats when authorized', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockCount.mockResolvedValue({ count: 42 })

    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toHaveProperty('totalUsers')
    expect(json).toHaveProperty('totalQuestions')
    expect(json).toHaveProperty('totalSessions')
    expect(json).toHaveProperty('totalAnswers')
    expect(json).toHaveProperty('pendingReports')
  })

  it('handles null counts gracefully (returns 0)', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockCount.mockResolvedValue({ count: null })

    const res = await GET()
    const json = await res.json()
    expect(json.totalUsers).toBe(0)
    expect(json.totalQuestions).toBe(0)
  })
})
