import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { mockCheckPermission, mockRpc, mockCookieFrom } = vi.hoisted(() => ({
  mockCheckPermission: vi.fn(),
  mockRpc: vi.fn(),
  mockCookieFrom: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mockCookieFrom })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ rpc: mockRpc }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  checkPermission: mockCheckPermission,
}))

import { DELETE, PATCH } from '../route'

const REQUEST_ID = '70000000-0000-4000-8000-000000000001'
const ELEMENT_ID = '70000000-0000-4000-8000-000000000002'

function params(id = ELEMENT_ID) {
  return { params: Promise.resolve({ id }) }
}

function request(method: 'PATCH' | 'DELETE', body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/admin/homepage/elements/${ELEMENT_ID}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/admin/homepage/elements/[id] governed mutations', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects unauthorized callers before the service RPC', async () => {
    mockCheckPermission.mockResolvedValue(null)
    const response = await PATCH(
      request('PATCH', { requestId: REQUEST_ID, content: 'Yeni' }),
      params(),
    )
    expect(response.status).toBe(403)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('validates the element and request UUIDs', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    const invalidElement = await PATCH(
      request('PATCH', { requestId: REQUEST_ID, content: 'Yeni' }),
      params('invalid'),
    )
    expect(invalidElement.status).toBe(400)

    const invalidRequest = await PATCH(request('PATCH', { content: 'Yeni' }), params())
    expect(invalidRequest.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('updates through one service-only RPC and returns the committed row', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    const element = { id: ELEMENT_ID, content: 'Yeni', alignment: 'left' }
    mockRpc.mockResolvedValue({
      data: { success: true, element, replayed: false },
      error: null,
    })

    const response = await PATCH(request('PATCH', {
      requestId: REQUEST_ID,
      content: 'Yeni',
      alignment: 'left',
      is_published: true,
    }), params())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, element, replayed: false })
    expect(mockRpc).toHaveBeenCalledWith('mutate_admin_homepage', {
      p_user_id: 'admin-1',
      p_request_id: REQUEST_ID,
      p_operation: 'element_update',
      p_payload: {
        id: ELEMENT_ID,
        updates: { content: 'Yeni', alignment: 'left', isPublished: true },
      },
    })
    expect(mockCookieFrom).not.toHaveBeenCalled()
  })

  it('deletes and audits in the same governed RPC transaction', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockRpc.mockResolvedValue({
      data: { success: true, deletedId: ELEMENT_ID, replayed: false },
      error: null,
    })

    const response = await DELETE(
      request('DELETE', { requestId: REQUEST_ID }),
      params(),
    )

    expect(response.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('mutate_admin_homepage', {
      p_user_id: 'admin-1',
      p_request_id: REQUEST_ID,
      p_operation: 'element_delete',
      p_payload: { id: ELEMENT_ID },
    })
    expect(mockCookieFrom).not.toHaveBeenCalled()
  })

  it('fails closed on a database error', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB failure' } })
    const response = await DELETE(
      request('DELETE', { requestId: REQUEST_ID }),
      params(),
    )
    expect(response.status).toBe(500)
  })
})
