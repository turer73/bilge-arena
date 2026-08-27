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
const ID_1 = '60000000-0000-4000-8000-000000000002'
const ID_2 = '60000000-0000-4000-8000-000000000003'

function makePatch(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/homepage/elements/reorder', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/admin/homepage/elements/reorder', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 if no permission', async () => {
    mockCheckPermission.mockResolvedValue(null)
    const res = await PATCH(makePatch({
      requestId: REQUEST_ID,
      section_key: 'hero',
      ordered_ids: [ID_1],
    }))
    expect(res.status).toBe(403)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('requires request id and a non-empty UUID list', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    const missingRequest = await PATCH(makePatch({ section_key: 'hero', ordered_ids: [ID_1] }))
    expect(missingRequest.status).toBe(400)

    const empty = await PATCH(makePatch({
      requestId: REQUEST_ID,
      section_key: 'hero',
      ordered_ids: [],
    }))
    expect(empty.status).toBe(400)

    const invalid = await PATCH(makePatch({
      requestId: REQUEST_ID,
      section_key: 'hero',
      ordered_ids: ['not-uuid'],
    }))
    expect(invalid.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('performs one atomic service RPC instead of per-row cookie DML', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockRpc.mockResolvedValue({
      data: { success: true, reorderedElements: 2, replayed: false },
      error: null,
    })

    const res = await PATCH(makePatch({
      requestId: REQUEST_ID,
      section_key: 'hero',
      ordered_ids: [ID_1, ID_2],
    }))

    expect(res.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('mutate_admin_homepage', {
      p_user_id: 'admin-1',
      p_request_id: REQUEST_ID,
      p_operation: 'elements_reorder',
      p_payload: { sectionKey: 'hero', orderedIds: [ID_1, ID_2] },
    })
    expect(mockCookieFrom).not.toHaveBeenCalled()
  })

  it('fails closed on RPC errors and incomplete results', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'DB failure' } })
    const failed = await PATCH(makePatch({
      requestId: REQUEST_ID,
      section_key: 'hero',
      ordered_ids: [ID_1],
    }))
    expect(failed.status).toBe(500)

    mockRpc.mockResolvedValueOnce({
      data: { success: true, reorderedElements: 0 },
      error: null,
    })
    const incomplete = await PATCH(makePatch({
      requestId: REQUEST_ID,
      section_key: 'hero',
      ordered_ids: [ID_1],
    }))
    expect(incomplete.status).toBe(500)
  })
})
