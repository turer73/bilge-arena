/**
 * Bilge Arena: POST /api/profile/avatar/preset — küratörlü hazır-avatar seçimi.
 * Güvenlik özü: yalnız BİLİNEN preset-id kabul edilir → statik path; rastgele
 * URL reddedilir (harici NSFW URL enjeksiyon guard).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const { mockGetUser, mockUpdate, mockEq } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUpdate: vi.fn(),
  mockEq: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({ from: vi.fn(() => ({ update: mockUpdate })) })),
}))

import { POST } from '../route'
import { PRESET_AVATARS } from '@/lib/constants/preset-avatars'

function makeReq(body: unknown): NextRequest {
  return new Request('http://localhost/api/profile/avatar/preset', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  mockUpdate.mockReturnValue({ eq: mockEq })
  mockEq.mockResolvedValue({ error: null })
})

describe('POST /api/profile/avatar/preset', () => {
  it('yetkisiz → 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeReq({ presetId: PRESET_AVATARS[0].id }))
    expect(res.status).toBe(401)
  })

  it('geçerli preset → avatar_url statik path olarak set edilir', async () => {
    const id = PRESET_AVATARS[0].id
    const res = await POST(makeReq({ presetId: id }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.avatar_url).toBe(`/avatars/preset/${id}.svg`)
    expect(mockUpdate).toHaveBeenCalledWith({ avatar_url: `/avatars/preset/${id}.svg` })
    expect(mockEq).toHaveBeenCalledWith('id', 'u1')
  })

  it('bilinmeyen preset → 400, DB güncellenmez (URL enjeksiyon guard)', async () => {
    const res = await POST(makeReq({ presetId: '../../etc/passwd' }))
    expect(res.status).toBe(400)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('geçersiz body → 400', async () => {
    const res = await POST(makeReq({}))
    expect(res.status).toBe(400)
  })

  it('katalog tutarlılığı: tüm presetler /avatars/preset/ altında + benzersiz id', () => {
    const ids = PRESET_AVATARS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const a of PRESET_AVATARS) {
      expect(a.path).toBe(`/avatars/preset/${a.id}.svg`)
    }
    expect(PRESET_AVATARS.length).toBeGreaterThan(0)
  })
})
