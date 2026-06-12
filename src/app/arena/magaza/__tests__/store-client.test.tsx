/**
 * Bilge Arena: StoreClient — arka plan mağazası UI.
 * Kategori filtresi, sahiplik durumları (Al/Uygula/Uygulandı),
 * satın alma akışı (bakiye+sahiplik güncellenir, otomatik uygula),
 * misafir CTA, yetersiz bakiyede buton disabled.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { PROFILE_BACKGROUNDS } from '@/lib/constants/profile-backgrounds'

const auth = vi.hoisted(() => ({
  value: {
    user: { id: 'u1' } as { id: string } | null,
    profile: {
      coin_balance: 2431,
      owned_backgrounds: ['none', 'gece-mavisi'],
    } as Record<string, unknown> | null,
    setProfile: vi.fn(),
  },
}))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => auth.value }))

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@/stores/toast-store', () => ({ toast: toastMock }))

import { StoreClient } from '../store-client'

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  auth.value.user = { id: 'u1' }
  auth.value.profile = { coin_balance: 2431, owned_backgrounds: ['none', 'gece-mavisi'] }
  fetchMock.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      success: true,
      coin_balance: 2031,
      owned_backgrounds: ['none', 'gece-mavisi', 'nebula'],
    }),
  })
})

describe('StoreClient', () => {
  test('katalog: tüm arka planlar listelenir, bakiye görünür', () => {
    render(<StoreClient />)
    expect(screen.getByLabelText('Nebula önizleme')).toBeInTheDocument()
    expect(screen.getByText(/2\.431/)).toBeInTheDocument()
  })

  test('kategori filtresi: Pixel seçilince yalnızca pixel temalar kalır', () => {
    render(<StoreClient />)
    fireEvent.click(screen.getByRole('button', { name: /Pixel/ }))
    expect(screen.getByLabelText('Piksel Okyanus önizleme')).toBeInTheDocument()
    expect(screen.queryByLabelText('Nebula önizleme')).not.toBeInTheDocument()
  })

  test('sahip olunan tema: Uygula butonu; tıklayınca localStorage + Uygulandı', async () => {
    render(<StoreClient />)
    fireEvent.click(screen.getByLabelText('Gece Mavisi önizleme'))
    const applyBtn = screen.getByRole('button', { name: 'Uygula' })
    fireEvent.click(applyBtn)

    expect(localStorage.getItem('bilge-arena-profile-background-v1')).toBe('gece-mavisi')
    expect(screen.getByText('✓ Uygulandı')).toBeInTheDocument()
    expect(toastMock.success).toHaveBeenCalled()
  })

  test('satın alma: POST + profil güncellenir + otomatik uygulanır', async () => {
    render(<StoreClient />)
    fireEvent.click(screen.getByLabelText('Nebula önizleme'))
    fireEvent.click(screen.getByRole('button', { name: 'Şimdi Al' }))

    await waitFor(() => expect(auth.value.setProfile).toHaveBeenCalled())
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ backgroundId: 'nebula' })
    expect(auth.value.setProfile.mock.calls[0][0]).toMatchObject({ coin_balance: 2031 })
    expect(localStorage.getItem('bilge-arena-profile-background-v1')).toBe('nebula')
  })

  test('yetersiz bakiye: Şimdi Al disabled', () => {
    auth.value.profile = { coin_balance: 100, owned_backgrounds: ['none', 'gece-mavisi'] }
    render(<StoreClient />)
    fireEvent.click(screen.getByLabelText('Piksel Okyanus önizleme')) // 1500
    expect(screen.getByRole('button', { name: 'Şimdi Al' })).toBeDisabled()
  })

  test('satın alma hatası: toast.error + profil değişmez', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Yetersiz coin (gerekli: 400, bakiye: 100)' }),
    })
    render(<StoreClient />)
    fireEvent.click(screen.getByLabelText('Nebula önizleme'))
    fireEvent.click(screen.getByRole('button', { name: 'Şimdi Al' }))

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled())
    expect(auth.value.setProfile).not.toHaveBeenCalled()
  })

  test('misafir: satın alma yerine giriş linki', () => {
    auth.value.user = null
    auth.value.profile = null
    render(<StoreClient />)
    fireEvent.click(screen.getByLabelText('Nebula önizleme'))
    expect(screen.getByRole('link', { name: 'Giriş Yap' })).toHaveAttribute(
      'href',
      '/giris?redirect=/arena/magaza',
    )
  })
})

describe('PROFILE_BACKGROUNDS katalog bütünlüğü', () => {
  test('id\'ler benzersiz, ücretliler pozitif fiyatlı, none ücretsiz', () => {
    const ids = PROFILE_BACKGROUNDS.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(PROFILE_BACKGROUNDS.find((b) => b.id === 'none')?.coinCost).toBeUndefined()
    for (const b of PROFILE_BACKGROUNDS) {
      if (b.coinCost !== undefined) expect(b.coinCost).toBeGreaterThan(0)
    }
  })

  test('varsayılan sahiplik (migration 063 default) katalogda mevcut', () => {
    for (const id of ['none', 'gece-mavisi']) {
      expect(PROFILE_BACKGROUNDS.some((b) => b.id === id)).toBe(true)
    }
  })
})
