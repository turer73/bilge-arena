import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockCheckPermission, mockSelectResult, mockInsertSingle } = vi.hoisted(() => ({
  mockCheckPermission: vi.fn(),
  mockSelectResult: vi.fn(),
  mockInsertSingle: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => {
          const chain = {
            eq: vi.fn(() => mockSelectResult()),
          }
          // Also await-able for .order().then(...)
          const p = mockSelectResult()
          return Object.assign(p as unknown as object, chain)
        }),
      })),
    })),
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({ single: mockInsertSingle })),
      })),
    })),
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  checkPermission: mockCheckPermission,
}))

import { GET, POST } from '../route'

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
    const json = await res.json()
    expect(json.elements).toHaveLength(1)
  })
})

describe('POST /api/admin/homepage/elements', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 if no permission', async () => {
    mockCheckPermission.mockResolvedValue(null)
    const res = await POST(makePost({ section_key: 'hero', element_type: 'text' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 if section_key missing', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    const res = await POST(makePost({ element_type: 'text' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if element_type missing', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    const res = await POST(makePost({ section_key: 'hero' }))
    expect(res.status).toBe(400)
  })

  it('creates element successfully', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockInsertSingle.mockResolvedValue({
      data: { id: 'new-1', section_key: 'hero', element_type: 'text' },
      error: null,
    })

    const res = await POST(makePost({ section_key: 'hero', element_type: 'text', content: 'Hello' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.element.id).toBe('new-1')
  })
})
