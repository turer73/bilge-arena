import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ enabled: vi.fn(), context: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/institution-tracking/server-security', () => ({
  isInstitutionTrackingEnabled: mocks.enabled,
}))
vi.mock('@/lib/institution-pilot/route-context', () => ({
  requireInstitutionPilotRouteContext: mocks.context,
}))

import { GET } from '../route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const directory = {
  institution: { name: 'Bilge Pilot Kursu', status: 'pilot' },
  membership: { role: 'manager' },
  classrooms: [{
    id: '22222222-2222-4222-8222-222222222222',
    name: 'TYT A Sınıfı',
    teacherAlias: 'Öğretmen Bir',
    activeStudentCount: 1,
    students: [{
      memberRef: 'a'.repeat(32),
      alias: 'Öğrenci Bir',
      joinedAt: '2026-08-01T09:00:00.000Z',
    }],
  }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.enabled.mockReturnValue(true)
  mocks.context.mockResolvedValue({ ok: true, userId: USER_ID, admin: { rpc: mocks.rpc } })
  mocks.rpc.mockResolvedValue({ data: directory, error: null })
})

describe('institution tracking directory route', () => {
  it('fails before auth when the tracking flag is off', async () => {
    mocks.enabled.mockReturnValue(false)
    const response = await GET(new Request('http://localhost/api/institution/tracking/directory'))
    expect(response.status).toBe(503)
    expect(mocks.context).not.toHaveBeenCalled()
  })

  it('returns a strict no-store directory', async () => {
    const response = await GET(new Request('http://localhost/api/institution/tracking/directory'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual(directory)
    expect(mocks.rpc).toHaveBeenCalledWith('get_institution_tracking_directory', { p_user_id: USER_ID })
  })

  it('rejects leaked identifiers and maps tenant errors', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { ...directory, userId: USER_ID }, error: null })
    expect((await GET(new Request('http://localhost/api/institution/tracking/directory'))).status).toBe(500)
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } })
    expect((await GET(new Request('http://localhost/api/institution/tracking/directory'))).status).toBe(403)
  })
})
