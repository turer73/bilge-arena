import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { mockCheckPermission, mockRpc, mockRateLimit } = vi.hoisted(() => ({
  mockCheckPermission: vi.fn(),
  mockRpc: vi.fn(),
  mockRateLimit: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({})) }))
vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: () => ({ rpc: mockRpc }) }))
vi.mock('@/lib/supabase/admin', () => ({ checkPermission: mockCheckPermission }))
vi.mock('@/lib/utils/admin-rate-limit', () => ({ checkAdminMutationRl: mockRateLimit }))

import { DELETE, PATCH } from '../route'

const ROLE_ID = '70000000-0000-4000-8000-000000000001'
const ADMIN_ID = '30000000-0000-4000-8000-000000000001'
const REQUEST_ID = '90000000-0000-4000-8000-000000000001'
const paramsPromise = Promise.resolve({ id: ROLE_ID })
const invalidParamsPromise = Promise.resolve({ id: 'not-a-uuid' })

function makePatch(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/admin/roles/${ROLE_ID}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
function makeDelete(requestId = REQUEST_ID) {
  return new NextRequest(`http://localhost/api/admin/roles/${ROLE_ID}`, {
    method: 'DELETE', headers: { 'x-request-id': requestId },
  })
}

describe('PATCH /api/admin/roles/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRateLimit.mockResolvedValue(null)
    mockRpc.mockResolvedValue({ data: { success: true }, error: null })
  })

  it('returns 403 before calling the privileged RPC without permission', async () => {
    mockCheckPermission.mockResolvedValue(null)
    const res = await PATCH(makePatch({ name: 'Editor', requestId: REQUEST_ID }), { params: paramsPromise })
    expect(res.status).toBe(403)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns the shared mutation rate-limit response', async () => {
    mockCheckPermission.mockResolvedValue({ id: ADMIN_ID })
    mockRateLimit.mockResolvedValue(NextResponse.json({ error: 'Çok fazla istek' }, { status: 429 }))
    const res = await PATCH(makePatch({ name: 'Editor', requestId: REQUEST_ID }), { params: paramsPromise })
    expect(res.status).toBe(429)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('requires both a UUID request id and an actual update field', async () => {
    mockCheckPermission.mockResolvedValue({ id: ADMIN_ID })
    expect((await PATCH(makePatch({ requestId: REQUEST_ID }), { params: paramsPromise })).status).toBe(400)
    expect((await PATCH(makePatch({ name: 'Editor', requestId: 'retry-1' }), { params: paramsPromise })).status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rejects a malformed role id before calling the privileged RPC', async () => {
    mockCheckPermission.mockResolvedValue({ id: ADMIN_ID })
    const res = await PATCH(
      makePatch({ name: 'Editor', requestId: REQUEST_ID }),
      { params: invalidParamsPromise },
    )
    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('maps database not-found without a route-side table read', async () => {
    mockCheckPermission.mockResolvedValue({ id: ADMIN_ID })
    mockRpc.mockResolvedValue({ data: null, error: { code: 'P0002' } })
    const res = await PATCH(makePatch({ name: 'Editor', requestId: REQUEST_ID }), { params: paramsPromise })
    expect(res.status).toBe(404)
  })

  it('calls the atomic update RPC with a strict normalized payload', async () => {
    mockCheckPermission.mockResolvedValue({ id: ADMIN_ID })
    const res = await PATCH(makePatch({
      name: ' New Name ', permissions: ['admin.users.view'], requestId: REQUEST_ID,
    }), { params: paramsPromise })
    expect(res.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('admin_update_role', {
      p_actor_id: ADMIN_ID, p_role_id: ROLE_ID, p_request_id: REQUEST_ID,
      p_payload: { name: 'New Name', permissions: ['admin.users.view'] },
    })
  })

  it('maps last-manager protection to conflict', async () => {
    mockCheckPermission.mockResolvedValue({ id: ADMIN_ID })
    mockRpc.mockResolvedValue({ data: null, error: { code: '23514' } })
    const res = await PATCH(makePatch({ permissions: [], requestId: REQUEST_ID }), { params: paramsPromise })
    expect(res.status).toBe(409)
  })
})

describe('DELETE /api/admin/roles/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRateLimit.mockResolvedValue(null)
    mockRpc.mockResolvedValue({ data: { success: true }, error: null })
  })

  it('returns 403 before calling the privileged RPC without permission', async () => {
    mockCheckPermission.mockResolvedValue(null)
    const res = await DELETE(makeDelete(), { params: paramsPromise })
    expect(res.status).toBe(403)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('requires a UUID idempotency header', async () => {
    mockCheckPermission.mockResolvedValue({ id: ADMIN_ID })
    const res = await DELETE(makeDelete('not-a-uuid'), { params: paramsPromise })
    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rejects a malformed role id before calling the privileged RPC', async () => {
    mockCheckPermission.mockResolvedValue({ id: ADMIN_ID })
    const res = await DELETE(makeDelete(), { params: invalidParamsPromise })
    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('maps system-role and assigned-role database guards', async () => {
    mockCheckPermission.mockResolvedValue({ id: ADMIN_ID })
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '22023' } })
    expect((await DELETE(makeDelete(), { params: paramsPromise })).status).toBe(400)
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '23514' } })
    expect((await DELETE(makeDelete(), { params: paramsPromise })).status).toBe(409)
  })

  it('calls the atomic delete RPC', async () => {
    mockCheckPermission.mockResolvedValue({ id: ADMIN_ID })
    const res = await DELETE(makeDelete(), { params: paramsPromise })
    expect(res.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('admin_delete_role', {
      p_actor_id: ADMIN_ID, p_role_id: ROLE_ID, p_request_id: REQUEST_ID,
    })
  })
})
