/**
 * Bilge Arena: DELETE /api/profile/avatar — avatarı kaldır (Google foto/baş-harf
 * fallback'ine döner). Serbest foto YÜKLEME (POST) güvenlik nedeniyle kaldırıldı;
 * bu dosyada artık yalnız DELETE var.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockGetUser, mockRemove, mockUpdate, mockEq } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockRemove: vi.fn(),
  mockUpdate: vi.fn(),
  mockEq: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    storage: { from: vi.fn(() => ({ remove: mockRemove })) },
    from: vi.fn(() => ({ update: mockUpdate })),
  })),
}))

import { DELETE } from '../route'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  mockRemove.mockResolvedValue({ data: null, error: null })
  mockUpdate.mockReturnValue({ eq: mockEq })
  mockEq.mockResolvedValue({ error: null })
})

describe('DELETE /api/profile/avatar', () => {
  it('yetkisiz kullanıcı → 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await DELETE()
    expect(res.status).toBe(401)
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it('auth: storage dosyalarını siler + avatar_url null yapar + success', async () => {
    const res = await DELETE()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    // 3 olası uzantı temizlenir
    expect(mockRemove).toHaveBeenCalledWith([
      'u1/avatar.jpg',
      'u1/avatar.png',
      'u1/avatar.webp',
    ])
    // profil avatar_url null'a çekilir
    expect(mockUpdate).toHaveBeenCalledWith({ avatar_url: null })
    expect(mockEq).toHaveBeenCalledWith('id', 'u1')
  })

  it('serbest foto YÜKLEME (POST) export edilmemeli — güvenlik regresyon guard', async () => {
    const mod = await import('../route')
    expect((mod as Record<string, unknown>).POST).toBeUndefined()
  })
})
