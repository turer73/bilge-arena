import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ checkPermission: vi.fn(), logAdminAction: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/institution-pilot/server-security', () => ({ isInstitutionPilotEnabled: () => true }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ marker: 'cookie', rpc: mocks.rpc })) }))
vi.mock('@/lib/supabase/admin', () => ({
  checkPermission: mocks.checkPermission,
  logAdminAction: mocks.logAdminAction,
}))

import { GET } from '../route'

const ADMIN_ID = '11111111-1111-4111-8111-111111111111'
const INSTITUTION_ID = '22222222-2222-4222-8222-222222222222'
const params = { params: Promise.resolve({ institutionId: INSTITUTION_ID }) }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.checkPermission.mockResolvedValue({ id: ADMIN_ID })
  mocks.logAdminAction.mockResolvedValue({ error: null })
})

describe('admin institution support directory route', () => {
  it('requires the dedicated support permission', async () => {
    mocks.checkPermission.mockResolvedValue(null)
    const response = await GET(new Request('http://localhost') as import('next/server').NextRequest, params)
    expect(response.status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('returns and audits only the granted read-only directory', async () => {
    const data = {
      institution: { id: INSTITUTION_ID, name: 'Bilge Kurs', status: 'pilot' },
      access: { scope: 'read_only', reason: 'Kurulum kontrolü için geçici destek.', expiresAt: '2026-08-14T11:00:00.000Z' },
      classrooms: [],
    }
    mocks.rpc.mockResolvedValue({ data, error: null })
    const response = await GET(new Request('http://localhost') as import('next/server').NextRequest, params)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(data)
    expect(mocks.rpc).toHaveBeenCalledWith('get_institution_support_directory', {
      p_admin_user_id: ADMIN_ID, p_institution_id: INSTITUTION_ID,
    })
    expect(mocks.logAdminAction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: 'view_institution_support_directory', targetId: INSTITUTION_ID,
    }))
  })

  it('fails closed when the manager grant is missing, revoked or expired', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501' } })
    const response = await GET(new Request('http://localhost') as import('next/server').NextRequest, params)
    expect(response.status).toBe(403)
    expect((await response.json()).error).toMatch(/kapalı|süresi dolmuş/)
    expect(mocks.logAdminAction).not.toHaveBeenCalled()
  })

  it('fails closed if the support-view audit event cannot be persisted', async () => {
    mocks.rpc.mockResolvedValue({ data: {
      institution: { id: INSTITUTION_ID, name: 'Bilge Kurs', status: 'pilot' },
      access: { scope: 'read_only', reason: 'Kurulum kontrolü için geçici destek.', expiresAt: '2026-08-14T11:00:00.000Z' },
      classrooms: [],
    }, error: null })
    mocks.logAdminAction.mockResolvedValue({ error: { code: '42501' } })
    const response = await GET(new Request('http://localhost') as import('next/server').NextRequest, params)
    expect(response.status).toBe(500)
  })
})
