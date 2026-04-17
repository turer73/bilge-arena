import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockCheckPermission, mockUpdateResult } = vi.hoisted(() => ({
  mockCheckPermission: vi.fn(),
  mockUpdateResult: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: mockUpdateResult,
        })),
      })),
    })),
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  checkPermission: mockCheckPermission,
}))

import { PATCH } from '../route'

const ID_1 = '60000000-0000-4000-8000-000000000001'
const ID_2 = '60000000-0000-4000-8000-000000000002'

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
    const res = await PATCH(makePatch({ section_key: 'hero', ordered_ids: [ID_1] }))
    expect(res.status).toBe(403)
  })

  it('returns 400 if section_key missing', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    const res = await PATCH(makePatch({ ordered_ids: [ID_1] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if ordered_ids empty', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    const res = await PATCH(makePatch({ section_key: 'hero', ordered_ids: [] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid UUID in ordered_ids', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    const res = await PATCH(makePatch({ section_key: 'hero', ordered_ids: ['not-uuid'] }))
    expect(res.status).toBe(400)
  })

  it('reorders elements successfully', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockUpdateResult.mockResolvedValue({ error: null })

    const res = await PATCH(makePatch({ section_key: 'hero', ordered_ids: [ID_1, ID_2] }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })
})
