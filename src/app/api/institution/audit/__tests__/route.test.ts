import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/institution-pilot/route-context', () => ({
  requireInstitutionPilotRouteContext: mocks.context,
}))

import { GET } from '../route'

const USER_ID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.context.mockResolvedValue({
    ok: true,
    userId: USER_ID,
    admin: { rpc: mocks.rpc },
  })
})

describe('institution audit route', () => {
  it('returns only bounded manager-scoped event projections', async () => {
    const data = {
      events: [{
        eventRef: 'a'.repeat(32),
        eventType: 'staff_added',
        actorAlias: 'Yönetici Bir',
        subjectAlias: 'Öğretmen Bir',
        classroomName: null,
        createdAt: '2026-08-23T10:00:00.000Z',
      }],
    }
    mocks.rpc.mockResolvedValueOnce({ data, error: null })
    const response = await GET(new Request('http://localhost/api/institution/audit?limit=25'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(data)
    expect(mocks.rpc).toHaveBeenCalledWith('get_my_institution_operation_events', {
      p_user_id: USER_ID,
      p_limit: 25,
    })
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('rejects unknown query fields and manager authorization failures', async () => {
    expect((await GET(new Request('http://localhost/api/institution/audit?limit=25&institutionId=leak'))).status)
      .toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()

    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } })
    expect((await GET(new Request('http://localhost/api/institution/audit'))).status).toBe(403)
  })
})
