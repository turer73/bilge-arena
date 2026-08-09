import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  checkPermission: vi.fn(),
  rate: vi.fn(),
  getConfig: vi.fn(),
  createService: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: mocks.createService,
}))
vi.mock('@/lib/supabase/admin', () => ({ checkPermission: mocks.checkPermission }))
vi.mock('../rate-limits', () => ({ checkTeacherClassroomRateLimit: mocks.rate }))
vi.mock('../server-security', () => ({ getTeacherClassroomServerConfig: mocks.getConfig }))

import { requireTeacherClassroomRouteContext } from '../route-context'

const config = {
  inviteSecret: 's'.repeat(32),
  noticeVersion: 'notice-v1',
  noticeHref: 'https://bilgearena.com/notice',
  sharingConsentVersion: 'share-v1',
  sharingConsentHref: 'https://bilgearena.com/consent',
}
const limiter = {} as never

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getConfig.mockReturnValue(config)
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  mocks.rate.mockResolvedValue({ success: true })
  mocks.checkPermission.mockResolvedValue({ id: 'user-1' })
  mocks.createService.mockReturnValue({ rpc: vi.fn() })
})

describe('teacher classroom route context', () => {
  it('checks the complete feature/legal/secret gate before authentication', async () => {
    mocks.getConfig.mockReturnValue(null)
    const result = await requireTeacherClassroomRouteContext(
      new Request('http://localhost/api/teacher/classrooms'),
      limiter,
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.response.status).toBe(503)
    expect(mocks.getUser).not.toHaveBeenCalled()
    expect(result.response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('returns 401 before rate or service-role access for an anonymous request', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    const result = await requireTeacherClassroomRouteContext(
      new Request('http://localhost/api/teacher/assignments'),
      limiter,
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.response.status).toBe(401)
    expect(mocks.rate).not.toHaveBeenCalled()
    expect(mocks.createService).not.toHaveBeenCalled()
  })

  it('applies the combined user/IP limiter and preserves Retry-After', async () => {
    mocks.rate.mockResolvedValue({ success: false, retryAfter: 19 })
    const request = new Request('http://localhost/api/teacher/assignments')
    const result = await requireTeacherClassroomRouteContext(request, limiter)
    expect(mocks.rate).toHaveBeenCalledWith(limiter, 'user-1', request.headers)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.response.status).toBe(429)
    expect(result.response.headers.get('Retry-After')).toBe('19')
  })

  it('requires the exact teacher permission on teacher-only routes', async () => {
    mocks.checkPermission.mockResolvedValue(null)
    const result = await requireTeacherClassroomRouteContext(
      new Request('http://localhost/api/teacher/classrooms'),
      limiter,
      true,
    )
    expect(mocks.checkPermission).toHaveBeenCalledWith(
      expect.anything(),
      'teacher.classrooms.manage',
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.response.status).toBe(403)
    expect(mocks.createService).not.toHaveBeenCalled()
  })

  it('returns an authenticated, permission-checked service context and fails closed without key', async () => {
    const success = await requireTeacherClassroomRouteContext(
      new Request('http://localhost/api/teacher/classrooms'),
      limiter,
      true,
    )
    expect(success).toMatchObject({ ok: true, userId: 'user-1', config })

    mocks.createService.mockImplementationOnce(() => { throw new Error('missing service key') })
    const failed = await requireTeacherClassroomRouteContext(
      new Request('http://localhost/api/teacher/assignments'),
      limiter,
    )
    expect(failed.ok).toBe(false)
    if (failed.ok) throw new Error('expected failure')
    expect(failed.response.status).toBe(503)
  })
})
