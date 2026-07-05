import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCheckPermission, mockCheckAdminRl, mockFrom, mockSvcFrom } = vi.hoisted(() => ({
  mockCheckPermission: vi.fn(),
  mockCheckAdminRl: vi.fn(),
  mockFrom: vi.fn(),
  mockSvcFrom: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: mockFrom })),
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ from: mockSvcFrom }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  checkPermission: mockCheckPermission,
}))
vi.mock('@/lib/utils/admin-rate-limit', () => ({
  checkAdminMutationRl: mockCheckAdminRl,
}))

import { NextRequest } from 'next/server'
import { GET, PATCH } from '../route'

function makePatch(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('admin/settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' }) // yetkili varsayilan
    mockCheckAdminRl.mockResolvedValue(null) // rate-limit gecer
    mockSvcFrom.mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    })
  })

  describe('GET', () => {
    it('403 if not admin', async () => {
      mockCheckPermission.mockResolvedValue(null)
      const res = await GET()
      expect(res.status).toBe(403)
    })

    it('returns settings map on success', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ key: 'maintenance_mode', value: false }], error: null,
        }),
      })
      const res = await GET()
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.settings.maintenance_mode).toBe(false)
    })
  })

  describe('PATCH', () => {
    it('403 if not admin — RPC/DB dokunulmaz', async () => {
      mockCheckPermission.mockResolvedValue(null)
      const res = await PATCH(makePatch({ key: 'maintenance_mode', value: true }))
      expect(res.status).toBe(403)
      expect(mockSvcFrom).not.toHaveBeenCalled()
    })

    it('429 when admin mutation rate-limited', async () => {
      const { NextResponse } = await import('next/server')
      mockCheckAdminRl.mockResolvedValue(NextResponse.json({ error: 'rl' }, { status: 429 }))
      const res = await PATCH(makePatch({ key: 'maintenance_mode', value: true }))
      expect(res.status).toBe(429)
    })

    it('400 if key missing', async () => {
      const res = await PATCH(makePatch({ value: true }))
      expect(res.status).toBe(400)
    })

    it('400 for unknown setting key (allowlist)', async () => {
      const res = await PATCH(makePatch({ key: 'evil_key', value: 1 }))
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('Bilinmeyen')
    })

    it('400 for value failing validator (daily_quest_count out of range)', async () => {
      const res = await PATCH(makePatch({ key: 'daily_quest_count', value: 99 }))
      expect(res.status).toBe(400)
    })

    it('400 for wrong type (maintenance_mode non-boolean)', async () => {
      const res = await PATCH(makePatch({ key: 'maintenance_mode', value: 'yes' }))
      expect(res.status).toBe(400)
    })

    it('200 on valid setting update', async () => {
      const res = await PATCH(makePatch({ key: 'daily_quest_count', value: 5 }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
    })
  })
})
