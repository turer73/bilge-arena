import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ trackingEnabled: vi.fn(), programEnabled: vi.fn(), context: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/institution-tracking/server-security', () => ({
  isInstitutionTrackingEnabled: mocks.trackingEnabled,
  isInstitutionStudyProgramEnabled: mocks.programEnabled,
}))
vi.mock('@/lib/institution-pilot/route-context', () => ({ requireInstitutionPilotRouteContext: mocks.context }))

import { POST } from '../route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const PROGRAM_REF = 'b'.repeat(32)
const REQUEST_ID = '33333333-3333-4333-8333-333333333333'
const published = {
  programRef: PROGRAM_REF, status: 'published', weekStart: '2026-08-17', dailyMinuteLimit: 45,
  modelVersion: 'institution-program-v1', itemCount: 5, createdAt: '2026-08-14T00:00:00.000Z',
  reviewedAt: '2026-08-14T00:05:00.000Z', publishedAt: '2026-08-14T00:05:00.000Z', replayed: false,
}

function request() {
  return new Request(`http://localhost/api/institution/tracking/programs/${PROGRAM_REF}/publish`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ requestId: REQUEST_ID }),
  })
}

beforeEach(() => {
  vi.clearAllMocks(); mocks.trackingEnabled.mockReturnValue(true); mocks.programEnabled.mockReturnValue(true)
  mocks.context.mockResolvedValue({ ok: true, userId: USER_ID, admin: { rpc: mocks.rpc } })
  mocks.rpc.mockResolvedValue({ data: published, error: null })
})

describe('institution study program publish route', () => {
  it('requires a separate teacher-reviewed publish request', async () => {
    const response = await POST(request(), { params: Promise.resolve({ programRef: PROGRAM_REF }) })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(published)
    expect(mocks.rpc).toHaveBeenCalledWith('publish_institution_study_program', {
      p_user_id: USER_ID, p_program_ref: PROGRAM_REF, p_request_id: REQUEST_ID,
    })
  })

  it('rejects invalid refs and maps ownership denial', async () => {
    expect((await POST(request(), { params: Promise.resolve({ programRef: 'invalid' }) })).status).toBe(400)
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'private' } })
    const denied = await POST(request(), { params: Promise.resolve({ programRef: PROGRAM_REF }) })
    expect(denied.status).toBe(403)
    expect(JSON.stringify(await denied.json())).not.toContain('private')
  })
})
