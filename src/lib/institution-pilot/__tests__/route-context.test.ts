import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  getUser: vi.fn(),
  checkPermission: vi.fn(),
  rate: vi.fn(),
  createService: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mocks.createService,
}))
vi.mock('@/lib/supabase/admin', () => ({ checkPermission: mocks.checkPermission }))
vi.mock('@/lib/teacher-classroom/rate-limits', () => ({
  teacherClassroomReadLimiter: { kind: 'read' },
  teacherClassroomWriteLimiter: { kind: 'write' },
  checkTeacherClassroomRateLimit: mocks.rate,
}))
vi.mock('../server-security', () => ({ isInstitutionPilotEnabled: mocks.enabled }))

import { requireInstitutionPilotRouteContext } from '../route-context'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.enabled.mockReturnValue(true)
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mocks.rate.mockResolvedValue({ success: true })
  mocks.checkPermission.mockResolvedValue({ id: 'user-1' })
  mocks.createService.mockReturnValue({ rpc: vi.fn() })
})

describe('institution pilot route context', () => {
  it('fails closed before auth when the separate pilot flag is off', async () => {
    mocks.enabled.mockReturnValue(false)
    const result = await requireInstitutionPilotRouteContext(
      new Request('http://localhost/api/institution/workspace'),
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.response.status).toBe(503)
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it('requires authentication, rate limit and exact institution permission', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })
    const anonymous = await requireInstitutionPilotRouteContext(
      new Request('http://localhost/api/institution/workspace'),
    )
    expect(anonymous.ok).toBe(false)
    if (anonymous.ok) throw new Error('expected failure')
    expect(anonymous.response.status).toBe(401)

    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mocks.checkPermission.mockResolvedValueOnce(null)
    const denied = await requireInstitutionPilotRouteContext(
      new Request('http://localhost/api/institution/workspace'),
    )
    expect(mocks.checkPermission).toHaveBeenCalledWith(
      expect.anything(),
      'institution.pilot.access',
    )
    expect(denied.ok).toBe(false)
    if (denied.ok) throw new Error('expected failure')
    expect(denied.response.status).toBe(403)
  })

  it('returns a service context and preserves limiter retry headers', async () => {
    const success = await requireInstitutionPilotRouteContext(
      new Request('http://localhost/api/institution/workspace'),
    )
    expect(success).toMatchObject({ ok: true, userId: 'user-1' })

    mocks.rate.mockResolvedValueOnce({ success: false, retryAfter: 17 })
    const limited = await requireInstitutionPilotRouteContext(
      new Request('http://localhost/api/institution/workspace'),
    )
    expect(limited.ok).toBe(false)
    if (limited.ok) throw new Error('expected failure')
    expect(limited.response.status).toBe(429)
    expect(limited.response.headers.get('Retry-After')).toBe('17')
  })

  it('uses a caller-selected limiter for mutation routes', async () => {
    const writeLimiter = { kind: 'write' } as never
    await requireInstitutionPilotRouteContext(
      new Request('http://localhost/api/institution/staff', { method: 'POST' }),
      writeLimiter,
    )
    expect(mocks.rate).toHaveBeenCalledWith(
      writeLimiter,
      'user-1',
      expect.any(Headers),
    )
  })
})
