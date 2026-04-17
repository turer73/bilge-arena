import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockCheckPermission,
  mockRoleSingle,
  mockUpdate,
  mockDelete,
  mockAssignmentsLimit,
} = vi.hoisted(() => ({
  mockCheckPermission: vi.fn(),
  mockRoleSingle: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockAssignmentsLimit: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn((table: string) => {
      if (table === 'roles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ single: mockRoleSingle })),
          })),
        }
      }
      if (table === 'user_roles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ limit: mockAssignmentsLimit })),
          })),
        }
      }
      return {}
    }),
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: vi.fn((table: string) => {
      if (table === 'roles') {
        return {
          update: vi.fn(() => ({ eq: mockUpdate })),
          delete: vi.fn(() => ({ eq: mockDelete })),
        }
      }
      if (table === 'role_permissions') {
        return {
          delete: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
          insert: vi.fn().mockResolvedValue({ error: null }),
        }
      }
      if (table === 'admin_logs') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }
      return {}
    }),
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  checkPermission: mockCheckPermission,
}))

import { PATCH, DELETE } from '../route'

const ROLE_ID = '70000000-0000-4000-8000-000000000001'

function makePatch(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/admin/roles/${ROLE_ID}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeDelete() {
  return new NextRequest(`http://localhost/api/admin/roles/${ROLE_ID}`, {
    method: 'DELETE',
  })
}

const paramsPromise = Promise.resolve({ id: ROLE_ID })

describe('PATCH /api/admin/roles/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 if no permission', async () => {
    mockCheckPermission.mockResolvedValue(null)
    const res = await PATCH(makePatch({ name: 'Editor' }), { params: paramsPromise })
    expect(res.status).toBe(403)
  })

  it('returns 400 if body is empty', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    const res = await PATCH(makePatch({}), { params: paramsPromise })
    expect(res.status).toBe(400)
  })

  it('returns 404 if role not found', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockRoleSingle.mockResolvedValue({ data: null, error: null })

    const res = await PATCH(makePatch({ name: 'Editor' }), { params: paramsPromise })
    expect(res.status).toBe(404)
  })

  it('updates role successfully', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockRoleSingle.mockResolvedValue({ data: { id: ROLE_ID, name: 'Old' }, error: null })
    mockUpdate.mockResolvedValue({ error: null })

    const res = await PATCH(
      makePatch({ name: 'New Name', permissions: ['admin.users.view'] }),
      { params: paramsPromise }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })
})

describe('DELETE /api/admin/roles/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 if no permission', async () => {
    mockCheckPermission.mockResolvedValue(null)
    const res = await DELETE(makeDelete(), { params: paramsPromise })
    expect(res.status).toBe(403)
  })

  it('returns 404 if role not found', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockRoleSingle.mockResolvedValue({ data: null, error: null })

    const res = await DELETE(makeDelete(), { params: paramsPromise })
    expect(res.status).toBe(404)
  })

  it('blocks deletion of system roles', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockRoleSingle.mockResolvedValue({
      data: { id: ROLE_ID, name: 'Admin', is_system: true, slug: 'admin' },
      error: null,
    })

    const res = await DELETE(makeDelete(), { params: paramsPromise })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('Sistem')
  })

  it('blocks deletion if users assigned', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockRoleSingle.mockResolvedValue({
      data: { id: ROLE_ID, name: 'Moderator', is_system: false, slug: 'moderator' },
      error: null,
    })
    mockAssignmentsLimit.mockResolvedValue({ data: [{ id: 'u1' }] })

    const res = await DELETE(makeDelete(), { params: paramsPromise })
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain('atanm')
  })

  it('deletes role successfully', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockRoleSingle.mockResolvedValue({
      data: { id: ROLE_ID, name: 'Editor', is_system: false, slug: 'editor' },
      error: null,
    })
    mockAssignmentsLimit.mockResolvedValue({ data: [] })
    mockDelete.mockResolvedValue({ error: null })

    const res = await DELETE(makeDelete(), { params: paramsPromise })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })
})
