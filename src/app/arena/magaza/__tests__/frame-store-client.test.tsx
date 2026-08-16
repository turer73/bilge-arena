/**
 * Bilge Arena: FrameStoreClient — çerçeve mağazası UI.
 *
 * Bu sekmenin var olma sebebi ölçülmüş bir kusur: çerçeveler mağazanın EN UCUZ
 * ürünleri (30–300) ama satın alma yalnız profil sayfasındaydı, mağazada hiç
 * listelenmiyordu. Testler bu yüzden özellikle şunları kilitliyor:
 *   - en ucuz çerçevenin gerçekten listelendiği
 *   - yetersiz bakiyede "ne kadar eksik" bilgisinin gösterildiği
 *   - seçimin localStorage'a yazıldığı (DB değil — kişiselleştirme ile aynı anahtar)
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PROFILE_FRAMES, FRAME_STORAGE_KEY } from '@/lib/constants/profile-frames'

const auth = vi.hoisted(() => ({
  value: {
    user: { id: 'u1' } as { id: string } | null,
    profile: {
      coin_balance: 100,
      owned_frames: ['none', 'mavi'],
      avatar_url: null,
    } as Record<string, unknown> | null,
    setProfile: vi.fn(),
  },
}))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => auth.value }))

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@/stores/toast-store', () => ({ toast: toastMock }))

import { FrameStoreClient } from '../frame-store-client'

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

/** Katalogdaki en ucuz satın alınabilir çerçeve — 'alev', 30 coin. */
const CHEAPEST = PROFILE_FRAMES
  .filter((f) => f.coinCost !== undefined)
  .sort((a, b) => (a.coinCost ?? 0) - (b.coinCost ?? 0))[0]

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  auth.value.user = { id: 'u1' }
  auth.value.profile = { coin_balance: 100, owned_frames: ['none', 'mavi'], avatar_url: null }
  fetchMock.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      success: true,
      frameId: CHEAPEST.id,
      coin_balance: 100 - (CHEAPEST.coinCost ?? 0),
      owned_frames: ['none', 'mavi', CHEAPEST.id],
    }),
  })
})

describe('FrameStoreClient', () => {
  test('en ucuz çerçeve katalogda fiyatıyla listelenir', () => {
    render(<FrameStoreClient />)
    expect(screen.getByText(CHEAPEST.name)).toBeInTheDocument()
    expect(screen.getByText(`🪙${CHEAPEST.coinCost}`)).toBeInTheDocument()
  })

  test('sahip olunan çerçeve ✓ ile işaretlenir', () => {
    render(<FrameStoreClient />)
    // 'none' ve 'mavi' sahip → en az iki ✓ olmalı
    expect(screen.getAllByText('✓').length).toBeGreaterThanOrEqual(2)
  })

  test('yetersiz bakiyede eksik tutar gösterilir (sadece "Yetersiz" değil)', () => {
    auth.value.profile = { coin_balance: 10, owned_frames: ['none', 'mavi'], avatar_url: null }
    render(<FrameStoreClient />)
    fireEvent.click(screen.getByLabelText(`${CHEAPEST.name} önizleme`))
    // 30 - 10 = 20 daha gerekiyor
    expect(screen.getByText(`🪙 ${(CHEAPEST.coinCost ?? 0) - 10} daha`)).toBeInTheDocument()
  })

  test('satın alma: onay → API → bakiye/sahiplik güncellenir ve otomatik uygulanır', async () => {
    render(<FrameStoreClient />)
    fireEvent.click(screen.getByLabelText(`${CHEAPEST.name} önizleme`))
    fireEvent.click(screen.getByText('Şimdi Al'))
    fireEvent.click(screen.getByText('Onayla'))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/profile/frames/purchase')
    expect(JSON.parse(options.body).frameId).toBe(CHEAPEST.id)

    await waitFor(() => expect(auth.value.setProfile).toHaveBeenCalled())
    const next = auth.value.setProfile.mock.calls[0][0]
    expect(next.coin_balance).toBe(100 - (CHEAPEST.coinCost ?? 0))
    expect(next.owned_frames).toContain(CHEAPEST.id)
    // Otomatik uygula → localStorage (DB değil)
    expect(localStorage.getItem(FRAME_STORAGE_KEY)).toBe(CHEAPEST.id)
  })

  test('sahip olunan çerçeveye Uygula: localStorage yazılır, API çağrılmaz', () => {
    render(<FrameStoreClient />)
    fireEvent.click(screen.getByLabelText('Mavi Hale önizleme'))
    fireEvent.click(screen.getByText('Uygula'))

    expect(localStorage.getItem(FRAME_STORAGE_KEY)).toBe('mavi')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('uygulanmış çerçevede buton yerine "Uygulandı" görünür', () => {
    localStorage.setItem(FRAME_STORAGE_KEY, 'mavi')
    render(<FrameStoreClient />)
    fireEvent.click(screen.getByLabelText('Mavi Hale önizleme'))
    expect(screen.getByText('✓ Uygulandı')).toBeInTheDocument()
  })

  test('misafir: satın alma yerine giriş CTA', () => {
    auth.value.user = null
    auth.value.profile = null
    render(<FrameStoreClient />)
    expect(screen.getByText('Giriş Yap')).toBeInTheDocument()
    expect(screen.queryByText('Şimdi Al')).not.toBeInTheDocument()
  })

  test('API hatası: bakiye güncellenmez, hata toast gösterilir', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Yetersiz coin' }),
    })
    render(<FrameStoreClient />)
    fireEvent.click(screen.getByLabelText(`${CHEAPEST.name} önizleme`))
    fireEvent.click(screen.getByText('Şimdi Al'))
    fireEvent.click(screen.getByText('Onayla'))

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled())
    expect(auth.value.setProfile).not.toHaveBeenCalled()
    expect(localStorage.getItem(FRAME_STORAGE_KEY)).toBeNull()
  })
})
