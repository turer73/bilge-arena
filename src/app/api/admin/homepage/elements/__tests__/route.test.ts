import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockCheckPermission, mockSelectResult, mockRpc, mockCookieFrom } = vi.hoisted(() => ({
  mockCheckPermission: vi.fn(),
  mockSelectResult: vi.fn(),
  mockRpc: vi.fn(),
  mockCookieFrom: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: mockCookieFrom.mockImplementation(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => {
          const promise = mockSelectResult()
          return Object.assign(promise as unknown as object, {
            eq: vi.fn(() => mockSelectResult()),
          })
        }),
      })),
    })),
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ rpc: mockRpc }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  checkPermission: mockCheckPermission,
}))

import { GET, POST } from '../route'

const REQUEST_ID = '60000000-0000-4000-8000-000000000001'

function makePost(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/homepage/elements', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/admin/homepage/elements', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 if no permission', async () => {
    mockCheckPermission.mockResolvedValue(null)
    const res = await GET(new NextRequest('http://localhost/api/admin/homepage/elements'))
    expect(res.status).toBe(403)
  })

  it('returns elements list', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockSelectResult.mockResolvedValue({
      data: [{ id: 'e1', section_key: 'hero', element_type: 'text' }],
      error: null,
    })

    const res = await GET(new NextRequest('http://localhost/api/admin/homepage/elements'))
    expect(res.status).toBe(200)
    expect((await res.json()).elements).toHaveLength(1)
  })
})

describe('POST /api/admin/homepage/elements', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 if no permission', async () => {
    mockCheckPermission.mockResolvedValue(null)
    const res = await POST(makePost({
      requestId: REQUEST_ID,
      section_key: 'hero',
      element_type: 'slogan',
    }))
    expect(res.status).toBe(403)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('requires a UUID request id', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    const res = await POST(makePost({ section_key: 'hero', element_type: 'slogan' }))
    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('creates through the service-only governed RPC with normalized defaults', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    const element = {
      id: '60000000-0000-4000-8000-000000000002',
      section_key: 'hero',
      element_type: 'slogan',
    }
    mockRpc.mockResolvedValue({
      data: { success: true, element, replayed: false },
      error: null,
    })

    const res = await POST(makePost({
      requestId: REQUEST_ID,
      section_key: 'hero',
      element_type: 'slogan',
      content: 'Hello',
    }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ element, replayed: false })
    expect(mockRpc).toHaveBeenCalledWith('mutate_admin_homepage', {
      p_user_id: 'admin-1',
      p_request_id: REQUEST_ID,
      p_operation: 'element_create',
      p_payload: {
        sectionKey: 'hero',
        elementType: 'slogan',
        content: 'Hello',
        imageUrl: null,
        altText: '',
        placement: 'below',
        alignment: 'center',
        size: 'md',
        styles: {},
      },
    })
  })

  it('fails closed on RPC error and never writes an audit row separately', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB failure' } })

    const res = await POST(makePost({
      requestId: REQUEST_ID,
      section_key: 'hero',
      element_type: 'slogan',
    }))
    expect(res.status).toBe(500)
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })
})
