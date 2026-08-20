import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetUser, mockPermissions, mockRoles } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockPermissions: vi.fn(),
  mockRoles: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  getUserPermissions: mockPermissions,
  getUserRoles: mockRoles,
}))

import { GET } from '../route'

describe('GET /api/admin/me/permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRoles.mockResolvedValue([{ slug: 'institution_pilot_staff', name: 'Kurum Pilotu Personeli' }])
  })

  it('rejects a pilot-only role even though user_roles is not empty', async () => {
    mockPermissions.mockResolvedValue(['institution.pilot.access'])
    expect((await GET()).status).toBe(403)
  })

  it('returns permissions for a real platform admin surface role', async () => {
    mockPermissions.mockResolvedValue(['institution.pilots.manage'])
    mockRoles.mockResolvedValue([{ slug: 'super_admin', name: 'Süper Admin' }])
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ permissions: ['institution.pilots.manage'] })
  })
})
