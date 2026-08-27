import { describe, it, expect, vi, beforeEach } from 'vitest'
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

import { PATCH } from '../route'

const REQUEST_ID = '60000000-0000-4000-8000-000000000001'

function makePatch(body: Record<string, unknown>, key = 'hero') {
  return new NextRequest(`http://localhost/api/admin/homepage/sections/${key}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function routeParams(key = 'hero') {
  return { params: Promise.resolve({ key }) }
}

describe('PATCH /api/admin/homepage/sections/[key]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 if no permission', async () => {
    mockCheckPermission.mockResolvedValue(null)
    const res = await PATCH(
      makePatch({ requestId: REQUEST_ID, config: {} }),
      routeParams(),
    )
    expect(res.status).toBe(403)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns 400 if request id or config is missing', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    const res = await PATCH(makePatch({ config: {} }), routeParams())
    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('returns 400 for an unknown section key', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    const res = await PATCH(
      makePatch({ requestId: REQUEST_ID, config: {} }, 'unknown'),
      routeParams('unknown'),
    )
    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('uses the service-only governed RPC and never cookie-client DML', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockRpc.mockResolvedValue({ data: { success: true, replayed: false }, error: null })

    const res = await PATCH(
      makePatch({
        requestId: REQUEST_ID,
        config: { title: 'Yeni baslik', subtitle: 'Alt baslik' },
      }),
      routeParams(),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true, replayed: false })
    expect(mockRpc).toHaveBeenCalledWith('mutate_admin_homepage', {
      p_user_id: 'admin-1',
      p_request_id: REQUEST_ID,
      p_operation: 'section_update',
      p_payload: {
        sectionKey: 'hero',
        config: { title: 'Yeni baslik', subtitle: 'Alt baslik' },
      },
    })
    expect(mockCookieFrom).not.toHaveBeenCalled()
  })

  it('fails closed on RPC error', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB failure' } })

    const res = await PATCH(
      makePatch({ requestId: REQUEST_ID, config: { title: 'x' } }),
      routeParams(),
    )
    expect(res.status).toBe(500)
  })
})
