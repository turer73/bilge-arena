import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ enabled: vi.fn(), context: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/institution-tracking/server-security', () => ({ isInstitutionTrackingEnabled: mocks.enabled }))
vi.mock('@/lib/institution-pilot/route-context', () => ({ requireInstitutionPilotRouteContext: mocks.context }))
vi.mock('@/lib/teacher-classroom/rate-limits', () => ({ teacherClassroomWriteLimiter: { kind: 'write' } }))

import { PATCH } from '../route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const FOLLOWUP_REF = 'b'.repeat(32)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.enabled.mockReturnValue(true)
  mocks.context.mockResolvedValue({ ok: true, userId: USER_ID, admin: { rpc: mocks.rpc } })
})

describe('institution follow-up resolution route', () => {
  it('resolves one opaque follow-up through the write limiter context', async () => {
    mocks.rpc.mockResolvedValue({ data: { followupRef: FOLLOWUP_REF, reasonCode: 'support_needed', status: 'resolved', openedAt: '2026-08-01T09:00:00.000Z', resolvedAt: '2026-08-14T09:00:00.000Z', replayed: false }, error: null })
    const requestId = '33333333-3333-4333-8333-333333333333'
    const response = await PATCH(new Request('http://localhost', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId }),
    }), { params: Promise.resolve({ followupRef: FOLLOWUP_REF }) })
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('resolve_institution_student_followup', {
      p_user_id: USER_ID, p_followup_ref: FOLLOWUP_REF, p_request_id: requestId,
    })
  })

  it('rejects malformed references before calling the database', async () => {
    const response = await PATCH(new Request('http://localhost', {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: crypto.randomUUID() }),
    }), { params: Promise.resolve({ followupRef: 'raw-id' }) })
    expect(response.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
