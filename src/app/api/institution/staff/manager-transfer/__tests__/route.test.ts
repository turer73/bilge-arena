import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/institution-pilot/route-context', () => ({
  requireInstitutionPilotRouteContext: mocks.context,
}))

import { POST } from '../route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const INSTITUTION_ID = '22222222-2222-4222-8222-222222222222'
const REQUEST_ID = '33333333-3333-4333-8333-333333333333'
const OLD_MANAGER_REF = 'a'.repeat(32)
const NEW_MANAGER_REF = 'b'.repeat(32)

function request(body: unknown) {
  return new Request('http://localhost/api/institution/staff/manager-transfer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.context.mockResolvedValue({
    ok: true,
    userId: USER_ID,
    admin: { rpc: mocks.rpc },
  })
})

describe('institution manager transfer route', () => {
  it('uses only the authenticated actor and opaque target membership', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        institutionId: INSTITUTION_ID,
        previousManagerRef: OLD_MANAGER_REF,
        managerRef: NEW_MANAGER_REF,
        replayed: false,
      },
      error: null,
    })
    const response = await POST(request({
      newManagerMemberRef: NEW_MANAGER_REF,
      requestId: REQUEST_ID,
    }))
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('transfer_my_pilot_institution_manager', {
      p_user_id: USER_ID,
      p_new_manager_member_ref: NEW_MANAGER_REF,
      p_request_id: REQUEST_ID,
    })
  })

  it('rejects tenant injection and maps an invalid target without database detail', async () => {
    expect((await POST(request({
      newManagerMemberRef: NEW_MANAGER_REF,
      requestId: REQUEST_ID,
      institutionId: INSTITUTION_ID,
    }))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()

    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0002' } })
    const missing = await POST(request({
      newManagerMemberRef: NEW_MANAGER_REF,
      requestId: REQUEST_ID,
    }))
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({
      error: 'Yeni yönetici aynı kurumda aktif bir öğretmen olmalıdır',
    })
  })
})
