import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Mocks ──────────────────────────────────────────

const mockCheckPermission = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  checkPermission: (...args: unknown[]) => mockCheckPermission(...args),
}))

const mockProfileSingle = vi.fn()
const mockRoleSingle = vi.fn()
const mockInsert = vi.fn()
const mockDelete = vi.fn()

function makeSupabaseFrom(table: string) {
  if (table === 'profiles') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single: mockProfileSingle })),
      })),
    }
  }
  if (table === 'roles') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ single: mockRoleSingle })),
      })),
    }
  }
  return { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn() })) })) }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }) },
    from: vi.fn((table: string) => makeSupabaseFrom(table)),
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: vi.fn((table: string) => {
      if (table === 'user_roles') {
        return {
          insert: mockInsert,
          delete: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: mockDelete,
            })),
          })),
        }
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    }),
  }),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({
    check: vi.fn().mockResolvedValue({ success: true }),
  }),
}))

import { POST, DELETE } from '../route'

// ─── Helpers ────────────────────────────────────────

function makeRequest(body: Record<string, unknown>, method = 'POST') {
  return new NextRequest('http://localhost/api/admin/roles/assign', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ─── Tests ──────────────────────────────────────────

describe('POST /api/admin/roles/assign', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 if no admin permission', async () => {
    mockCheckPermission.mockResolvedValue(null)
    const res = await POST(makeRequest({ userId: 'u1', roleId: 'r1' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 if userId missing', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    const res = await POST(makeRequest({ roleId: 'r1' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if roleId missing', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    const res = await POST(makeRequest({ userId: 'u1' }))
    expect(res.status).toBe(400)
  })

  it('returns 404 if user not found', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockProfileSingle.mockResolvedValue({ data: null, error: null })
    mockRoleSingle.mockResolvedValue({ data: { id: 'r1', slug: 'editor', name: 'Editor' }, error: null })

    const res = await POST(makeRequest({ userId: 'u1', roleId: 'r1' }))
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toContain('Kullan')
  })

  it('returns 404 if role not found', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockProfileSingle.mockResolvedValue({ data: { id: 'u1', username: 'test' }, error: null })
    mockRoleSingle.mockResolvedValue({ data: null, error: null })

    const res = await POST(makeRequest({ userId: 'u1', roleId: 'r1' }))
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toContain('Rol')
  })

  it('returns 409 if role already assigned (duplicate key)', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockProfileSingle.mockResolvedValue({ data: { id: 'u1', username: 'test' }, error: null })
    mockRoleSingle.mockResolvedValue({ data: { id: 'r1', slug: 'editor', name: 'Editor' }, error: null })
    mockInsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate' } })

    const res = await POST(makeRequest({ userId: 'u1', roleId: 'r1' }))
    expect(res.status).toBe(409)
  })

  it('assigns role successfully', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockProfileSingle.mockResolvedValue({ data: { id: 'u1', username: 'test' }, error: null })
    mockRoleSingle.mockResolvedValue({ data: { id: 'r1', slug: 'editor', name: 'Editor' }, error: null })
    mockInsert.mockResolvedValue({ error: null })

    const res = await POST(makeRequest({ userId: 'u1', roleId: 'r1' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })
})

describe('DELETE /api/admin/roles/assign', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 if no admin permission', async () => {
    mockCheckPermission.mockResolvedValue(null)
    const res = await DELETE(makeRequest({ userId: 'u1', roleId: 'r1' }, 'DELETE'))
    expect(res.status).toBe(403)
  })

  it('returns 400 if userId or roleId missing', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    const res = await DELETE(makeRequest({ userId: 'u1' }, 'DELETE'))
    expect(res.status).toBe(400)
  })

  it('blocks self-removal of super_admin role', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockRoleSingle.mockResolvedValue({ data: { slug: 'super_admin' }, error: null })

    const res = await DELETE(makeRequest({ userId: 'admin-1', roleId: 'r1' }, 'DELETE'))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Admin')
  })

  it('removes role successfully', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockRoleSingle.mockResolvedValue({ data: { slug: 'editor' }, error: null })
    mockDelete.mockResolvedValue({ error: null })

    const res = await DELETE(makeRequest({ userId: 'u1', roleId: 'r1' }, 'DELETE'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })
})
