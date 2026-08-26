import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockCheckPermission,
  mockRpc,
  mockCookieFrom,
  mockRevalidatePath,
  mockRateLimit,
} = vi.hoisted(() => ({
  mockCheckPermission: vi.fn(),
  mockRpc: vi.fn(),
  mockCookieFrom: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRateLimit: vi.fn(),
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

vi.mock('@/lib/utils/admin-rate-limit', () => ({
  checkAdminMutationRl: mockRateLimit,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}))

import { POST } from '../route'

const REQUEST_ID = '50000000-0000-4000-8000-000000000001'
const ELEMENT_ID = '50000000-0000-4000-8000-000000000002'

function makePost(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/homepage/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/admin/homepage/publish', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRateLimit.mockResolvedValue(null)
  })

  it('returns 403 if no permission', async () => {
    mockCheckPermission.mockResolvedValue(null)
    const res = await POST(makePost({ action: 'publish', requestId: REQUEST_ID }))
    expect(res.status).toBe(403)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('requires a request UUID and a valid action', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    expect((await POST(makePost({ action: 'publish' }))).status).toBe(400)
    expect((await POST(makePost({ action: 'delete', requestId: REQUEST_ID }))).status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('fails closed when the mutation rate-limit backend is unavailable', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockRateLimit.mockResolvedValue(new Response(
      JSON.stringify({ error: 'Güvenlik servisi geçici olarak kullanılamıyor' }),
      { status: 503 },
    ))

    const res = await POST(makePost({ action: 'publish', requestId: REQUEST_ID }))
    expect(res.status).toBe(503)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('defines the UI {action,requestId} form as an all-homepage mutation', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockRpc.mockResolvedValue({
      data: {
        success: true,
        sectionsChanged: 7,
        elementsChanged: 12,
        replayed: false,
      },
      error: null,
    })

    const res = await POST(makePost({ action: 'publish', requestId: REQUEST_ID }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      success: true,
      published_sections: 7,
      published_elements: 12,
      scope: 'all',
      replayed: false,
    })
    expect(mockRpc).toHaveBeenCalledWith('mutate_admin_homepage', {
      p_user_id: 'admin-1',
      p_request_id: REQUEST_ID,
      p_operation: 'publish',
      p_payload: {
        action: 'publish',
        scope: 'all',
        sectionKeys: [],
        elementIds: [],
      },
    })
    expect(mockCookieFrom).not.toHaveBeenCalled()
    expect(mockRevalidatePath).toHaveBeenCalledWith('/')
  })

  it('uses selection scope when either target list is supplied', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockRpc.mockResolvedValue({
      data: { success: true, sectionsChanged: 1, elementsChanged: 1, replayed: false },
      error: null,
    })

    const res = await POST(makePost({
      action: 'unpublish',
      requestId: REQUEST_ID,
      section_keys: ['hero'],
      element_ids: [ELEMENT_ID],
    }))
    expect(res.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('mutate_admin_homepage', expect.objectContaining({
      p_payload: {
        action: 'unpublish',
        scope: 'selection',
        sectionKeys: ['hero'],
        elementIds: [ELEMENT_ID],
      },
    }))
  })

  it('rejects empty target arrays and invalid identifiers instead of returning a no-op', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    expect((await POST(makePost({
      action: 'publish',
      requestId: REQUEST_ID,
      section_keys: [],
    }))).status).toBe(400)
    expect((await POST(makePost({
      action: 'publish',
      requestId: REQUEST_ID,
      section_keys: ['about'],
    }))).status).toBe(400)
    expect((await POST(makePost({
      action: 'publish',
      requestId: REQUEST_ID,
      element_ids: ['not-a-uuid'],
    }))).status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('fails closed and does not revalidate on RPC error', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB failure' } })
    const res = await POST(makePost({ action: 'publish', requestId: REQUEST_ID }))
    expect(res.status).toBe(500)
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})
