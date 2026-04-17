import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockCheckPermission, mockUpdateEq } = vi.hoisted(() => ({
  mockCheckPermission: vi.fn(),
  mockUpdateEq: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: mockUpdateEq,
      })),
    })),
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  checkPermission: mockCheckPermission,
}))

import { PATCH } from '../route'

function makePatch(body: Record<string, unknown>, key = 'hero') {
  return new NextRequest(`http://localhost/api/admin/homepage/sections/${key}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const paramsPromise = Promise.resolve({ key: 'hero' })

describe('PATCH /api/admin/homepage/sections/[key]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 if no permission', async () => {
    mockCheckPermission.mockResolvedValue(null)
    const res = await PATCH(makePatch({ config: {} }), { params: paramsPromise })
    expect(res.status).toBe(403)
  })

  it('returns 400 if config missing', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    const res = await PATCH(makePatch({}), { params: paramsPromise })
    expect(res.status).toBe(400)
  })

  it('returns 400 if config is not an object', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    const res = await PATCH(makePatch({ config: 'string' }), { params: paramsPromise })
    expect(res.status).toBe(400)
  })

  it('updates section config successfully', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockUpdateEq.mockResolvedValue({ error: null })

    const res = await PATCH(
      makePatch({ config: { title: 'Yeni baslik', subtitle: 'Alt baslik' } }),
      { params: paramsPromise }
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })

  it('returns 500 on db error', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockUpdateEq.mockResolvedValue({ error: { message: 'DB failure' } })

    const res = await PATCH(
      makePatch({ config: { title: 'x' } }),
      { params: paramsPromise }
    )
    expect(res.status).toBe(500)
  })
})
