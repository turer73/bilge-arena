import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ enabled: vi.fn(), context: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/institution-tracking/server-security', () => ({ isInstitutionTrackingEnabled: mocks.enabled }))
vi.mock('@/lib/institution-pilot/route-context', () => ({ requireInstitutionPilotRouteContext: mocks.context }))
vi.mock('@/lib/teacher-classroom/rate-limits', () => ({ teacherClassroomWriteLimiter: { kind: 'write' } }))

import { GET, POST } from '../route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const CLASSROOM_ID = '22222222-2222-4222-8222-222222222222'
const MEMBER_REF = 'a'.repeat(32)
const FOLLOWUP_REF = 'b'.repeat(32)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.enabled.mockReturnValue(true)
  mocks.context.mockResolvedValue({ ok: true, userId: USER_ID, admin: { rpc: mocks.rpc } })
})

describe('institution student follow-ups route', () => {
  it('reads only a validated opaque student scope', async () => {
    mocks.rpc.mockResolvedValue({ data: { followups: [] }, error: null })
    const response = await GET(new Request(`http://localhost/api/institution/tracking/followups?classroomId=${CLASSROOM_ID}&memberRef=${MEMBER_REF}`))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(mocks.rpc).toHaveBeenCalledWith('get_institution_student_followups', {
      p_user_id: USER_ID, p_classroom_id: CLASSROOM_ID, p_member_ref: MEMBER_REF,
    })
  })

  it('opens an idempotent, short-note support record', async () => {
    mocks.rpc.mockResolvedValue({ data: { followupRef: FOLLOWUP_REF, reasonCode: 'support_needed', status: 'open', openedAt: '2026-08-14T09:00:00.000Z', resolvedAt: null, replayed: false }, error: null })
    const requestId = '33333333-3333-4333-8333-333333333333'
    const response = await POST(new Request('http://localhost/api/institution/tracking/followups', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ classroomId: CLASSROOM_ID, memberRef: MEMBER_REF, reasonCode: 'support_needed', note: 'Haftalık çalışma planı görüşülecek.', requestId }),
    }))
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('open_institution_student_followup', expect.objectContaining({
      p_user_id: USER_ID, p_classroom_id: CLASSROOM_ID, p_member_ref: MEMBER_REF,
      p_reason_code: 'support_needed', p_request_id: requestId,
    }))
  })

  it('fails closed when disabled and maps duplicate open reasons to conflict', async () => {
    mocks.enabled.mockReturnValue(false)
    expect((await GET(new Request('http://localhost/api/institution/tracking/followups'))).status).toBe(503)
    expect(mocks.context).not.toHaveBeenCalled()
    mocks.enabled.mockReturnValue(true)
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '23505' } })
    const response = await POST(new Request('http://localhost/api/institution/tracking/followups', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ classroomId: CLASSROOM_ID, memberRef: MEMBER_REF, reasonCode: 'support_needed', note: null, requestId: crypto.randomUUID() }),
    }))
    expect(response.status).toBe(409)
  })
})
