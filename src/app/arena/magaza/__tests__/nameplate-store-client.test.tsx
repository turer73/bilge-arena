/**
 * NameplateStoreClient — isim paneli mağazası. Seçim DB'de (selected_nameplate):
 * "Uygula" → /select; sahipsiz ücretli panel → onay → /purchase + otomatik /select.
 *
 * Store yazımları patchProfile ile yapılır: yama yalnız sunucunun değiştirdiği
 * alanları içermeli. Render anındaki profili yaymak (eski setProfile deseni),
 * istek sürerken gelen taze XP/coin değerlerini eski kopyayla eziyordu — testler
 * bu yüzden yamanın TAM içeriğini ve araya giren değerlerin korunduğunu kilitler.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

type MockProfile = Record<string, unknown>

const auth = vi.hoisted(() => ({
  value: {
    user: { id: 'u1' } as { id: string } | null,
    profile: null as Record<string, unknown> | null,
    setProfile: vi.fn(),
    patchProfile: vi.fn(),
  },
}))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => auth.value }))

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@/stores/toast-store', () => ({ toast: toastMock }))

import { NameplateStoreClient } from '../nameplate-store-client'

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

const baseProfile = (): MockProfile => ({
  id: 'u1',
  username: 'Arenacı',
  display_name: 'Arenacı',
  role: 'user',
  xp: 10,
  coin_balance: 1000,
  owned_nameplates: ['none'],
  selected_nameplate: 'none',
})

/** Elle çözülen fetch cevabı — isteğin "uçuşta" olduğu anı yakalamak için. */
function deferred() {
  let resolve!: (value: unknown) => void
  const promise = new Promise((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const okJson = (body: unknown) => ({ ok: true, json: () => Promise.resolve(body) })

const PURCHASE_RESPONSE = {
  success: true,
  nameplateId: 'mavi-akim',
  coin_balance: 750,
  owned_nameplates: ['none', 'mavi-akim'],
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.value.user = { id: 'u1' }
  auth.value.profile = baseProfile()
  // Gerçek store gibi: yama GÜNCEL profile birleştirilir (render kopyasına değil).
  auth.value.patchProfile.mockImplementation((patch: MockProfile) => {
    if (auth.value.profile) auth.value.profile = { ...auth.value.profile, ...patch }
  })
  fetchMock.mockImplementation((url: string) =>
    Promise.resolve(
      url.includes('/purchase') ? okJson(PURCHASE_RESPONSE) : okJson({ success: true }),
    ),
  )
})

function openPurchase() {
  fireEvent.click(screen.getByLabelText('Mavi Akım önizleme'))
  fireEvent.click(screen.getByRole('button', { name: 'Şimdi Al' }))
  fireEvent.click(screen.getByRole('button', { name: 'Onayla' }))
}

describe('NameplateStoreClient', () => {
  test('katalog render olur, ücretli panel fiyatıyla listelenir', () => {
    render(<NameplateStoreClient />)
    expect(screen.getByLabelText('Mavi Akım önizleme')).toBeInTheDocument()
    expect(screen.getByLabelText('Evren önizleme')).toBeInTheDocument()
    expect(screen.getByText('🪙1500')).toBeInTheDocument()
  })

  test('Uygula → /select POST, yama yalnız selected_nameplate içerir', async () => {
    render(<NameplateStoreClient />)
    // Varsayılan seçili = 'gece' (ücretsiz) → detayda "Uygula"
    fireEvent.click(screen.getByRole('button', { name: 'Uygula' }))

    await waitFor(() => expect(auth.value.patchProfile).toHaveBeenCalledOnce())
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/profile/nameplates/select')!
    expect(JSON.parse(call[1].body)).toEqual({ nameplateId: 'gece' })
    expect(auth.value.patchProfile.mock.calls[0][0]).toStrictEqual({ selected_nameplate: 'gece' })
    expect(auth.value.setProfile).not.toHaveBeenCalled()
    // Diğer alanlar korunur
    expect(auth.value.profile).toEqual({ ...baseProfile(), selected_nameplate: 'gece' })
  })

  test('Uygula: istek sürerken gelen taze XP/coin eski kopyayla ezilmez', async () => {
    const select = deferred()
    fetchMock.mockImplementation(() => select.promise)
    render(<NameplateStoreClient />)
    fireEvent.click(screen.getByRole('button', { name: 'Uygula' }))

    // İstek uçuştayken store'a taze değerler gelir (render yeniden olmadan)
    auth.value.profile = { ...auth.value.profile, xp: 60, coin_balance: 1040 }
    select.resolve(okJson({ success: true }))

    await waitFor(() => expect(auth.value.patchProfile).toHaveBeenCalledOnce())
    expect(auth.value.profile).toMatchObject({ xp: 60, coin_balance: 1040, selected_nameplate: 'gece' })
  })

  test('satın alma: /purchase + otomatik /select, yama yalnız sunucu alanlarını içerir', async () => {
    const purchase = deferred()
    fetchMock.mockImplementation((url: string) =>
      url.includes('/purchase') ? purchase.promise : Promise.resolve(okJson({ success: true })),
    )
    render(<NameplateStoreClient />)
    openPurchase()

    // Satın alma uçuştayken taze XP gelir
    auth.value.profile = { ...auth.value.profile, xp: 60 }
    purchase.resolve(okJson(PURCHASE_RESPONSE))

    await waitFor(() => expect(auth.value.patchProfile).toHaveBeenCalledOnce())
    const buyCall = fetchMock.mock.calls.find((c) => c[0] === '/api/profile/nameplates/purchase')!
    expect(JSON.parse(buyCall[1].body)).toEqual({ nameplateId: 'mavi-akim' })
    const selCall = fetchMock.mock.calls.find((c) => c[0] === '/api/profile/nameplates/select')!
    expect(JSON.parse(selCall[1].body)).toEqual({ nameplateId: 'mavi-akim' })

    expect(auth.value.patchProfile.mock.calls[0][0]).toStrictEqual({
      coin_balance: 750,
      owned_nameplates: ['none', 'mavi-akim'],
      selected_nameplate: 'mavi-akim',
    })
    expect(auth.value.setProfile).not.toHaveBeenCalled()
    expect(auth.value.profile).toEqual({
      ...baseProfile(),
      xp: 60,
      coin_balance: 750,
      owned_nameplates: ['none', 'mavi-akim'],
      selected_nameplate: 'mavi-akim',
    })
    expect(toastMock.success).toHaveBeenCalledWith('Satın alındı! 🪙', 'Yeni bakiye: 750')
  })

  test('satın alındı ama /select başarısız: yama seçili panele dokunmaz', async () => {
    auth.value.profile = { ...baseProfile(), selected_nameplate: 'gece' }
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('/purchase')
          ? okJson(PURCHASE_RESPONSE)
          : { ok: false, json: () => Promise.resolve({ error: 'fail' }) },
      ),
    )
    render(<NameplateStoreClient />)
    openPurchase()

    await waitFor(() => expect(auth.value.patchProfile).toHaveBeenCalledOnce())
    expect(auth.value.patchProfile.mock.calls[0][0]).toStrictEqual({
      coin_balance: 750,
      owned_nameplates: ['none', 'mavi-akim'],
    })
    expect(auth.value.profile).toMatchObject({ selected_nameplate: 'gece', coin_balance: 750 })
  })

  test('satın alma hatası: toast.error, profil yamalanmaz', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Yetersiz coin' }) }),
    )
    render(<NameplateStoreClient />)
    openPurchase()

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled())
    expect(auth.value.patchProfile).not.toHaveBeenCalled()
    expect(auth.value.setProfile).not.toHaveBeenCalled()
  })

  test('Uygula hatası: toast.error, profil yamalanmaz', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'fail' }) }),
    )
    render(<NameplateStoreClient />)
    fireEvent.click(screen.getByRole('button', { name: 'Uygula' }))

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled())
    expect(auth.value.patchProfile).not.toHaveBeenCalled()
  })

  test('misafir: satın alma yerine giriş CTA', () => {
    auth.value.user = null
    auth.value.profile = null
    render(<NameplateStoreClient />)
    expect(screen.getByRole('link', { name: 'Giriş Yap' })).toHaveAttribute(
      'href',
      '/giris?redirect=/arena/magaza',
    )
    expect(screen.queryByRole('button', { name: 'Şimdi Al' })).not.toBeInTheDocument()
  })
})
