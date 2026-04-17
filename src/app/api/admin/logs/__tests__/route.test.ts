import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { mockCheckPermission, mockLogsRange, mockProfilesIn } = vi.hoisted(() => ({
  mockCheckPermission: vi.fn(),
  mockLogsRange: vi.fn(),
  mockProfilesIn: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn((table: string) => {
      if (table === 'admin_logs') {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              eq: vi.fn(() => ({
                range: mockLogsRange,
              })),
              range: mockLogsRange,
            })),
          })),
        }
      }
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            in: mockProfilesIn,
          })),
        }
      }
      return {}
    }),
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  checkPermission: mockCheckPermission,
}))

import { GET } from '../route'

function makeRequest(url = 'http://localhost/api/admin/logs') {
  return new NextRequest(url)
}

describe('GET /api/admin/logs', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 if no permission', async () => {
    mockCheckPermission.mockResolvedValue(null)
    const res = await GET(makeRequest())
    expect(res.status).toBe(403)
  })

  it('returns logs with admin names', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockLogsRange.mockResolvedValue({
      data: [{ id: 'log1', admin_id: 'admin-1', action: 'update_question', target_type: 'question' }],
      count: 1,
      error: null,
    })
    mockProfilesIn.mockResolvedValue({
      data: [{ id: 'admin-1', display_name: 'Admin User', username: 'admin' }],
    })

    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.logs).toHaveLength(1)
    expect(json.logs[0].admin_name).toBe('Admin User')
    expect(json.total).toBe(1)
  })

  it('returns 500 on db error', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockLogsRange.mockResolvedValue({
      data: null,
      count: null,
      error: { message: 'DB error' },
    })

    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
  })

  it('pagination defaults apply (page=1, limit=20)', async () => {
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockLogsRange.mockResolvedValue({ data: [], count: 0, error: null })
    mockProfilesIn.mockResolvedValue({ data: [] })

    const res = await GET(makeRequest())
    const json = await res.json()
    expect(json.page).toBe(1)
    expect(json.limit).toBe(20)
  })
})
