import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { mockCheckPermission, mockRpc, mockRateLimit } = vi.hoisted(() => ({
  mockCheckPermission: vi.fn(), mockRpc: vi.fn(), mockRateLimit: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ checkPermission: mockCheckPermission }))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({})) }))
vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: () => ({ rpc: mockRpc }) }))
vi.mock('@/lib/utils/admin-rate-limit', () => ({ checkAdminMutationRl: mockRateLimit }))

import { DELETE, POST } from '../route'

const USER_ID = '10000000-0000-4000-8000-000000000001'
const ROLE_ID = '20000000-0000-4000-8000-000000000001'
const ADMIN_ID = '30000000-0000-4000-8000-000000000001'
const REQUEST_ID = '40000000-0000-4000-8000-000000000001'
const validBody = { userId: USER_ID, roleId: ROLE_ID, requestId: REQUEST_ID }

function makeRequest(body: Record<string, unknown>, method = 'POST') {
  return new NextRequest('http://localhost/api/admin/roles/assign', {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

describe('POST /api/admin/roles/assign', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRateLimit.mockResolvedValue(null)
    mockRpc.mockResolvedValue({ data: { success: true }, error: null })
  })
  it('returns 403 before calling the privileged RPC without permission', async () => {
    mockCheckPermission.mockResolvedValue(null)
    expect((await POST(makeRequest(validBody))).status).toBe(403)
    expect(mockRpc).not.toHaveBeenCalled()
  })
  it('returns the shared mutation rate-limit response', async () => {
    mockCheckPermission.mockResolvedValue({ id: ADMIN_ID })
    mockRateLimit.mockResolvedValue(NextResponse.json({ error: 'Çok fazla istek' }, { status: 429 }))
    expect((await POST(makeRequest(validBody))).status).toBe(429)
    expect(mockRpc).not.toHaveBeenCalled()
  })
  it('requires user, role and UUID request ids', async () => {
    mockCheckPermission.mockResolvedValue({ id: ADMIN_ID })
    expect((await POST(makeRequest({ roleId: ROLE_ID, requestId: REQUEST_ID }))).status).toBe(400)
    expect((await POST(makeRequest({ userId: USER_ID, roleId: ROLE_ID }))).status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })
  it('maps not found and duplicate assignment errors', async () => {
    mockCheckPermission.mockResolvedValue({ id: ADMIN_ID })
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'P0002' } })
    expect((await POST(makeRequest(validBody))).status).toBe(404)
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '23505' } })
    expect((await POST(makeRequest(validBody))).status).toBe(409)
  })
  it('calls the atomic assignment RPC', async () => {
    mockCheckPermission.mockResolvedValue({ id: ADMIN_ID })
    expect((await POST(makeRequest(validBody))).status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('admin_assign_role', {
      p_actor_id: ADMIN_ID, p_user_id: USER_ID, p_role_id: ROLE_ID, p_request_id: REQUEST_ID,
    })
  })
})

describe('DELETE /api/admin/roles/assign', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRateLimit.mockResolvedValue(null)
    mockRpc.mockResolvedValue({ data: { success: true }, error: null })
  })
  it('returns 403 before calling the privileged RPC without permission', async () => {
    mockCheckPermission.mockResolvedValue(null)
    expect((await DELETE(makeRequest(validBody, 'DELETE'))).status).toBe(403)
    expect(mockRpc).not.toHaveBeenCalled()
  })
  it('rejects an incomplete payload', async () => {
    mockCheckPermission.mockResolvedValue({ id: ADMIN_ID })
    expect((await DELETE(makeRequest({ userId: USER_ID }, 'DELETE'))).status).toBe(400)
  })
  it('maps self-super-admin and last-manager guards', async () => {
    mockCheckPermission.mockResolvedValue({ id: ADMIN_ID })
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '22023' } })
    expect((await DELETE(makeRequest(validBody, 'DELETE'))).status).toBe(400)
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '23514' } })
    expect((await DELETE(makeRequest(validBody, 'DELETE'))).status).toBe(409)
  })
  it('calls the atomic revoke RPC', async () => {
    mockCheckPermission.mockResolvedValue({ id: ADMIN_ID })
    expect((await DELETE(makeRequest(validBody, 'DELETE'))).status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('admin_revoke_role', {
      p_actor_id: ADMIN_ID, p_user_id: USER_ID, p_role_id: ROLE_ID, p_request_id: REQUEST_ID,
    })
  })
})
