import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { mockCheckPermission, mockRpc, mockRateLimit } = vi.hoisted(() => ({
  mockCheckPermission: vi.fn(), mockRpc: vi.fn(), mockRateLimit: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({})) }))
vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: () => ({ rpc: mockRpc }) }))
vi.mock('@/lib/supabase/admin', () => ({ checkPermission: mockCheckPermission }))
vi.mock('@/lib/utils/admin-rate-limit', () => ({ checkAdminMutationRl: mockRateLimit }))

import { POST } from '../route'

const ADMIN_ID = '30000000-0000-4000-8000-000000000001'
const REQUEST_ID = '40000000-0000-4000-8000-000000000001'
const ROLE_ID = '50000000-0000-4000-8000-000000000001'
const validBody = {
  name: 'Denetçi', slug: 'denetci', description: 'Salt denetim rolü',
  permissions: ['admin.logs.view'], requestId: REQUEST_ID,
}

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/roles', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

describe('POST /api/admin/roles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRateLimit.mockResolvedValue(null)
    mockRpc.mockResolvedValue({
      data: { role: { id: ROLE_ID, name: 'Denetçi', slug: 'denetci' } }, error: null,
    })
  })

  it('checks permission before rate limit and service RPC', async () => {
    mockCheckPermission.mockResolvedValue(null)
    expect((await POST(makeRequest(validBody))).status).toBe(403)
    expect(mockRateLimit).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns the shared mutation rate-limit response', async () => {
    mockCheckPermission.mockResolvedValue({ id: ADMIN_ID })
    mockRateLimit.mockResolvedValue(NextResponse.json({ error: 'Çok fazla istek' }, { status: 429 }))
    expect((await POST(makeRequest(validBody))).status).toBe(429)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rejects extra keys, duplicate permissions and a missing request id', async () => {
    mockCheckPermission.mockResolvedValue({ id: ADMIN_ID })
    expect((await POST(makeRequest({ ...validBody, unknown: true }))).status).toBe(400)
    expect((await POST(makeRequest({ ...validBody, permissions: ['admin.logs.view', 'admin.logs.view'] }))).status).toBe(400)
    const { requestId: _requestId, ...missingRequest } = validBody
    expect((await POST(makeRequest(missingRequest))).status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('calls the atomic create RPC and returns its role projection', async () => {
    mockCheckPermission.mockResolvedValue({ id: ADMIN_ID })
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ role: { id: ROLE_ID, name: 'Denetçi', slug: 'denetci' } })
    expect(mockRpc).toHaveBeenCalledWith('admin_create_role', {
      p_actor_id: ADMIN_ID,
      p_request_id: REQUEST_ID,
      p_payload: {
        name: 'Denetçi', slug: 'denetci', description: 'Salt denetim rolü',
        permissions: ['admin.logs.view'],
      },
    })
  })

  it('maps duplicate slug and unexpected result contracts', async () => {
    mockCheckPermission.mockResolvedValue({ id: ADMIN_ID })
    mockRpc.mockResolvedValueOnce({ data: null, error: { code: '23505' } })
    expect((await POST(makeRequest(validBody))).status).toBe(409)
    mockRpc.mockResolvedValueOnce({ data: {}, error: null })
    expect((await POST(makeRequest(validBody))).status).toBe(500)
  })
})
