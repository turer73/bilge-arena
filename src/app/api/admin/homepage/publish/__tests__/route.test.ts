import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockCheckPermission, mockUpdateIn } = vi.hoisted(() => ({
  mockCheckPermission: vi.fn(),
  mockUpdateIn: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        in: mockUpdateIn,
      })),
    })),
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  checkPermission: mockCheckPermission,
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { POST } from '../route'

const SECTION_ID = '50000000-0000-4000-8000-000000000001'

function makePost(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/homepage/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/admin/homepage/publish', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 if no permission', async () => {
    mockCheckPermission.mockResolvedValue(null)
    const res = await POST(makePost({ action: 'publish', section_keys: ['hero'] }))
    expect(res.status).toBe(403)
  })

  it('returns 400 for invalid action', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    const res = await POST(makePost({ action: 'delete', section_keys: ['hero'] }))
    expect(res.status).toBe(400)
  })

  it('publishes sections successfully', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockUpdateIn.mockResolvedValue({ count: 2 })

    const res = await POST(makePost({ action: 'publish', section_keys: ['hero', 'about'] }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
    expect(json.published_sections).toBe(2)
  })

  it('publishes elements successfully', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockUpdateIn.mockResolvedValue({ count: 3 })

    const res = await POST(makePost({ action: 'unpublish', element_ids: [SECTION_ID] }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.published_elements).toBe(3)
  })

  it('rejects invalid element UUIDs', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    const res = await POST(makePost({ action: 'publish', element_ids: ['not-a-uuid'] }))
    expect(res.status).toBe(400)
  })
})
