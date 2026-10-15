/**
 * Bilge Arena: useCosmeticPurchase — beş kozmetik kategorisi için ortak satın alma.
 *
 * Kilitlenen davranış:
 *   - her kategori kendi ucuna kendi gövde anahtarıyla POST eder
 *   - başarıda profil yalnız sunucunun döndürdüğü iki alanla yamalanır
 *     (patchProfile): render anındaki profil kopyası yayılırsa istek sürerken
 *     gelen taze XP/coin değerleri ezilir
 *   - hata ve bağlantı kopmasında profile dokunulmaz, false döner
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const auth = vi.hoisted(() => ({
  value: {
    user: { id: 'u1' } as { id: string } | null,
    profile: null as Record<string, unknown> | null,
    // Gerçek store gibi: setProfile profilin tamamını değiştirir, patchProfile
    // verilen alanları GÜNCEL profile birleştirir.
    setProfile: vi.fn<(profile: Record<string, unknown> | null) => void>(),
    patchProfile: vi.fn<(patch: Record<string, unknown>) => void>(),
  },
}))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => auth.value }))

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@/stores/toast-store', () => ({ toast: toastMock }))

import { useCosmeticPurchase, type CosmeticCategory } from '../use-cosmetic-purchase'

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

function baseProfile(): Record<string, unknown> {
  return {
    id: 'u1',
    total_xp: 1200,
    coin_balance: 1000,
    avatar_url: null,
    owned_backgrounds: ['none'],
    owned_frames: ['none'],
    owned_nameplates: ['none'],
    owned_avatar_decorations: [],
    owned_cosmetic_badges: [],
  }
}

function okResponse(data: Record<string, unknown>) {
  return { ok: true, json: () => Promise.resolve(data) }
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.value.user = { id: 'u1' }
  auth.value.profile = baseProfile()
  auth.value.setProfile.mockImplementation((profile) => {
    auth.value.profile = profile
  })
  auth.value.patchProfile.mockImplementation((patch) => {
    if (auth.value.profile) auth.value.profile = { ...auth.value.profile, ...patch }
  })
})

const CASES: Array<{
  category: CosmeticCategory
  url: string
  bodyKey: string
  ownedKey: string
}> = [
  { category: 'background', url: '/api/profile/backgrounds/purchase', bodyKey: 'backgroundId', ownedKey: 'owned_backgrounds' },
  { category: 'frame', url: '/api/profile/frames/purchase', bodyKey: 'frameId', ownedKey: 'owned_frames' },
  { category: 'nameplate', url: '/api/profile/nameplates/purchase', bodyKey: 'nameplateId', ownedKey: 'owned_nameplates' },
  {
    category: 'avatar_decoration',
    url: '/api/profile/avatar-decorations/purchase',
    bodyKey: 'decorationId',
    ownedKey: 'owned_avatar_decorations',
  },
  {
    category: 'cosmetic_badge',
    url: '/api/profile/cosmetic-badges/purchase',
    bodyKey: 'badgeId',
    ownedKey: 'owned_cosmetic_badges',
  },
]

describe('useCosmeticPurchase', () => {
  test.each(CASES)(
    '$category: doğru uca POST + yalnız bakiye ve $ownedKey yamalanır',
    async ({ category, url, bodyKey, ownedKey }) => {
      fetchMock.mockResolvedValue(
        okResponse({ success: true, coin_balance: 600, [ownedKey]: ['none', 'yeni'] }),
      )
      const { result } = renderHook(() => useCosmeticPurchase())

      let ok: boolean | undefined
      await act(async () => {
        ok = await result.current.purchase({ category, itemId: 'yeni', itemName: 'Yeni Ürün' })
      })

      expect(ok).toBe(true)
      expect(fetchMock).toHaveBeenCalledOnce()
      const [calledUrl, options] = fetchMock.mock.calls[0]
      expect(calledUrl).toBe(url)
      expect(options.method).toBe('POST')
      expect(JSON.parse(options.body)).toEqual({ [bodyKey]: 'yeni' })

      // Yama yalnız sunucunun döndürdüğü iki alanı içerir — profilin geri kalanı yok.
      expect(auth.value.patchProfile).toHaveBeenCalledOnce()
      expect(auth.value.patchProfile).toHaveBeenCalledWith({
        coin_balance: 600,
        [ownedKey]: ['none', 'yeni'],
      })
      expect(auth.value.setProfile).not.toHaveBeenCalled()
      // Diğer alanlar korunur.
      expect(auth.value.profile).toEqual({
        ...baseProfile(),
        coin_balance: 600,
        [ownedKey]: ['none', 'yeni'],
      })
      expect(toastMock.success).toHaveBeenCalledWith('Yeni Ürün alındı! 🪙', 'Yeni bakiye: 600')
      expect(result.current.busyId).toBeNull()
    },
  )

  test('satın alma sürerken gelen taze XP, render anındaki profil kopyasıyla ezilmez', async () => {
    let resolveFetch!: (response: unknown) => void
    fetchMock.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve }))
    const { result } = renderHook(() => useCosmeticPurchase())

    let pending!: Promise<boolean>
    act(() => {
      pending = result.current.purchase({ category: 'frame', itemId: 'alev', itemName: 'Alev Çemberi' })
    })
    await waitFor(() => expect(result.current.busyId).toBe('alev'))

    // İstek uçarken store'a taze bir değer gelir (ör. günlük giriş ödülü).
    // Hook yeniden render olmaz; closure'daki profil artık eski.
    auth.value.profile = { ...auth.value.profile, total_xp: 1500 }
    await act(async () => {
      resolveFetch(okResponse({ success: true, coin_balance: 970, owned_frames: ['none', 'alev'] }))
      await pending
    })

    expect(auth.value.patchProfile).toHaveBeenCalledOnce()
    expect(auth.value.setProfile).not.toHaveBeenCalled()
    expect(auth.value.profile).toEqual({
      ...baseProfile(),
      total_xp: 1500,
      coin_balance: 970,
      owned_frames: ['none', 'alev'],
    })
    expect(result.current.busyId).toBeNull()
  })

  test('profil henüz yüklenmediyse de yama store\'a iletilir (ilk cevaba uygulanır)', async () => {
    auth.value.profile = null
    fetchMock.mockResolvedValue(
      okResponse({ success: true, coin_balance: 50, owned_cosmetic_badges: ['yildiz'] }),
    )
    const { result } = renderHook(() => useCosmeticPurchase())

    await act(async () => {
      await result.current.purchase({ category: 'cosmetic_badge', itemId: 'yildiz', itemName: 'Yıldız' })
    })

    expect(auth.value.patchProfile).toHaveBeenCalledWith({
      coin_balance: 50,
      owned_cosmetic_badges: ['yildiz'],
    })
    expect(auth.value.setProfile).not.toHaveBeenCalled()
  })

  test('API hatası: profil yamalanmaz, hata toast gösterilir, false döner', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: 'Yetersiz coin' }) })
    const { result } = renderHook(() => useCosmeticPurchase())

    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.purchase({ category: 'nameplate', itemId: 'altin', itemName: 'Altın' })
    })

    expect(ok).toBe(false)
    expect(toastMock.error).toHaveBeenCalledWith('Satın alınamadı', 'Yetersiz coin')
    expect(auth.value.patchProfile).not.toHaveBeenCalled()
    expect(auth.value.setProfile).not.toHaveBeenCalled()
    expect(auth.value.profile).toEqual(baseProfile())
    expect(result.current.busyId).toBeNull()
  })

  test('bağlantı hatası: profil yamalanmaz, bağlantı toast gösterilir, false döner', async () => {
    fetchMock.mockRejectedValue(new Error('ağ'))
    const { result } = renderHook(() => useCosmeticPurchase())

    let ok: boolean | undefined
    await act(async () => {
      ok = await result.current.purchase({ category: 'background', itemId: 'nebula', itemName: 'Nebula' })
    })

    expect(ok).toBe(false)
    expect(toastMock.error).toHaveBeenCalledWith('Bağlantı hatası', 'Tekrar dene')
    expect(auth.value.patchProfile).not.toHaveBeenCalled()
    expect(auth.value.setProfile).not.toHaveBeenCalled()
    expect(result.current.busyId).toBeNull()
  })
})
