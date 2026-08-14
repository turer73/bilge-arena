import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ context: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/institution-pilot/route-context', () => ({ requireInstitutionPilotRouteContext: mocks.context }))

import { GET, POST } from '../route'
import { PATCH, DELETE } from '../[roleRef]/route'
import { POST as ASSIGN, DELETE as REVOKE } from '../[roleRef]/members/[memberRef]/route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const REQUEST_ID = '22222222-2222-4222-8222-222222222222'
const ROLE_REF = 'a'.repeat(32)
const MEMBER_REF = 'b'.repeat(32)

function request(path: string, method = 'GET', body?: unknown) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.context.mockResolvedValue({ ok: true, userId: USER_ID, admin: { rpc: mocks.rpc } })
})

describe('institution role routes', () => {
  it('reads the manager-owned role directory', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { permissions: [], roles: [], members: [] }, error: null })
    expect((await GET(request('/api/institution/roles'))).status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('get_my_institution_role_directory', { p_user_id: USER_ID })
  })

  it('creates and updates only strict role payloads', async () => {
    mocks.rpc.mockResolvedValue({ data: { roleRef: ROLE_REF, replayed: false }, error: null })
    const body = { name: 'Koordinatör', description: null, permissions: ['institution.classrooms.view_all'], requestId: REQUEST_ID }
    expect((await POST(request('/api/institution/roles', 'POST', body))).status).toBe(201)
    expect(mocks.rpc).toHaveBeenLastCalledWith('create_my_institution_role', expect.objectContaining({ p_user_id: USER_ID, p_permissions: body.permissions }))
    expect((await PATCH(request(`/api/institution/roles/${ROLE_REF}`, 'PATCH', body), { params: Promise.resolve({ roleRef: ROLE_REF }) })).status).toBe(200)
    expect(mocks.rpc).toHaveBeenLastCalledWith('update_my_institution_role', expect.objectContaining({ p_role_ref: ROLE_REF }))
    mocks.rpc.mockClear()
    expect((await POST(request('/api/institution/roles', 'POST', { ...body, institutionId: crypto.randomUUID() }))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('deletes and assigns only opaque tenant references', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { roleRef: ROLE_REF, deleted: true, replayed: false }, error: null })
    expect((await DELETE(request(`/api/institution/roles/${ROLE_REF}`, 'DELETE', { requestId: REQUEST_ID }), { params: Promise.resolve({ roleRef: ROLE_REF }) })).status).toBe(200)

    mocks.rpc.mockResolvedValueOnce({ data: { roleRef: ROLE_REF, memberRef: MEMBER_REF, assigned: true, replayed: false }, error: null })
    expect((await ASSIGN(request('x', 'POST', { requestId: REQUEST_ID }), { params: Promise.resolve({ roleRef: ROLE_REF, memberRef: MEMBER_REF }) })).status).toBe(200)
    mocks.rpc.mockResolvedValueOnce({ data: { roleRef: ROLE_REF, memberRef: MEMBER_REF, assigned: false, replayed: false }, error: null })
    expect((await REVOKE(request('x', 'DELETE', { requestId: REQUEST_ID }), { params: Promise.resolve({ roleRef: ROLE_REF, memberRef: MEMBER_REF }) })).status).toBe(200)
  })
})
