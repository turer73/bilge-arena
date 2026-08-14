import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/institution-pilot/route-context', () => ({
  requireInstitutionPilotRouteContext: mocks.context,
}))

import { DELETE, GET, POST } from '../route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const INSTITUTION_ID = '22222222-2222-4222-8222-222222222222'
const REQUEST_ID = '33333333-3333-4333-8333-333333333333'
const ACTIVE = {
  institutionId: INSTITUTION_ID,
  active: true,
  grantRef: 'a'.repeat(32),
  scope: 'read_only',
  reason: 'Teknik kurulum kontrolü için geçici erişim.',
  grantedAt: '2026-08-14T10:00:00.000Z',
  expiresAt: '2026-08-14T11:00:00.000Z',
  replayed: false,
}

function request(method: string, body?: unknown) {
  return new Request('http://localhost/api/institution/support-access', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.context.mockResolvedValue({ ok: true, userId: USER_ID, admin: { rpc: mocks.rpc } })
})

describe('institution support access route', () => {
  it('delegates authentication and returns the current manager-owned state', async () => {
    mocks.rpc.mockResolvedValue({ data: ACTIVE, error: null })
    const response = await GET(request('GET'))
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('get_my_institution_support_access', { p_user_id: USER_ID })
  })

  it('validates and opens only a bounded read-only grant', async () => {
    mocks.rpc.mockResolvedValue({ data: ACTIVE, error: null })
    const response = await POST(request('POST', {
      durationMinutes: 60, reason: ACTIVE.reason, requestId: REQUEST_ID,
    }))
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('grant_my_institution_support_access', {
      p_user_id: USER_ID, p_duration_minutes: 60, p_reason: ACTIVE.reason, p_request_id: REQUEST_ID,
    })

    const invalid = await POST(request('POST', {
      durationMinutes: 1441, reason: ACTIVE.reason, requestId: REQUEST_ID,
    }))
    expect(invalid.status).toBe(400)
  })

  it('revokes immediately with a replay-safe request id', async () => {
    const inactive = {
      institutionId: INSTITUTION_ID, active: false, grantRef: null, scope: 'read_only',
      reason: null, grantedAt: null, expiresAt: null, replayed: false,
    }
    mocks.rpc.mockResolvedValue({ data: inactive, error: null })
    const response = await DELETE(request('DELETE', { requestId: REQUEST_ID }))
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('revoke_my_institution_support_access', {
      p_user_id: USER_ID, p_request_id: REQUEST_ID,
    })
  })

  it('passes authorization failures through without calling RPCs', async () => {
    mocks.context.mockResolvedValue({ ok: false, response: Response.json({ error: 'Yetkisiz' }, { status: 401 }) })
    expect((await GET(request('GET'))).status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
