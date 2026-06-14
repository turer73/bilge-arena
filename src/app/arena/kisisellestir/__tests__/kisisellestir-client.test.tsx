/**
 * Bilge Arena: KisisellestirClient — kişiselleştirme stüdyosu.
 * Alan sekmeleri (zemin/kart/panel/çerçeve/rozet), her alanın AYRI seçim
 * hedefi (zemin ≠ kart localStorage anahtarı), nameplate DB seçimi, sahiplik
 * filtresi + personel bypass, misafir CTA.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const auth = vi.hoisted(() => ({
  value: {
    user: { id: 'u1' } as { id: string } | null,
    profile: {
      username: 'Arenacı',
      display_name: 'Arenacı',
      avatar_url: null,
      total_xp: 1200,
      coin_balance: 5000,
      owned_backgrounds: ['none', 'gece-mavisi'],
      owned_frames: ['none', 'mavi'],
      owned_nameplates: ['none', 'gece'],
      selected_nameplate: 'none',
      owned_cosmetic_badges: [] as string[],
      owned_avatar_decorations: ['aura'] as string[],
      selected_avatar_decorations: [] as string[],
      role: 'user',
    } as Record<string, unknown> | null,
    setProfile: vi.fn(),
    loading: false,
  },
}))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => auth.value }))

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@/stores/toast-store', () => ({ toast: toastMock }))

import { KisisellestirClient } from '../kisisellestir-client'

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

function resetProfile() {
  auth.value.user = { id: 'u1' }
  auth.value.loading = false
  auth.value.profile = {
    username: 'Arenacı',
    display_name: 'Arenacı',
    avatar_url: null,
    total_xp: 1200,
    coin_balance: 5000,
    owned_backgrounds: ['none', 'gece-mavisi'],
    owned_frames: ['none', 'mavi'],
    owned_nameplates: ['none', 'gece'],
    selected_nameplate: 'none',
    owned_cosmetic_badges: [],
    owned_avatar_decorations: ['aura'],
    selected_avatar_decorations: [],
    role: 'user',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  resetProfile()
  fetchMock.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/backgrounds')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ backgrounds: [] }) })
    }
    if (typeof url === 'string' && url.includes('/api/cosmetic-badges')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ badges: [] }) })
    }
    // nameplate select POST
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) })
  })
})

describe('KisisellestirClient', () => {
  test('başlık + alan sekmeleri render olur, varsayılan alan zemin', () => {
    render(<KisisellestirClient />)
    expect(screen.getByText('🎨 Kişiselleştirme Stüdyosu')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '🌅 Zemin' })).toHaveAttribute('aria-pressed', 'true')
    // zemin grid'inde ücretsiz tema görünür
    expect(screen.getByLabelText('Gece Mavisi')).toBeInTheDocument()
  })

  test('zemin seçimi ZEMIN anahtarına yazar + zemin-changed olayını tetikler (karta DEĞİL)', () => {
    const zeminSpy = vi.fn()
    window.addEventListener('zemin-changed', zeminSpy)
    render(<KisisellestirClient />)
    fireEvent.click(screen.getByLabelText('Gece Mavisi'))

    expect(localStorage.getItem('bilge-arena-zemin-v1')).toBe('gece-mavisi')
    // kart anahtarı DOKUNULMAMIŞ olmalı (ayrışma)
    expect(localStorage.getItem('bilge-arena-profile-background-v1')).toBeNull()
    expect(zeminSpy).toHaveBeenCalled()
    window.removeEventListener('zemin-changed', zeminSpy)
  })

  test('kart alanı: arka plan KART anahtarına yazar + bg-changed (zemine DEĞİL)', () => {
    const bgSpy = vi.fn()
    window.addEventListener('bg-changed', bgSpy)
    render(<KisisellestirClient />)
    fireEvent.click(screen.getByRole('button', { name: /Profil Kartı/ }))
    fireEvent.click(screen.getByLabelText('Gece Mavisi'))

    expect(localStorage.getItem('bilge-arena-profile-background-v1')).toBe('gece-mavisi')
    expect(localStorage.getItem('bilge-arena-zemin-v1')).toBeNull()
    expect(bgSpy).toHaveBeenCalled()
    window.removeEventListener('bg-changed', bgSpy)
  })

  test('çerçeve alanı: çerçeve seçimi FRAME anahtarına yazar', () => {
    render(<KisisellestirClient />)
    fireEvent.click(screen.getByRole('button', { name: /Çerçeve/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Mavi Hale' }))
    expect(localStorage.getItem('bilge-arena-profile-frame-v1')).toBe('mavi')
  })

  test('isim paneli: seçim /select API POST eder + profil günceller', async () => {
    render(<KisisellestirClient />)
    fireEvent.click(screen.getByRole('button', { name: /İsim Paneli/ }))
    // 'Gece' ücretsiz panel — adına tıkla
    fireEvent.click(screen.getByText('Gece').closest('button')!)

    await waitFor(() => expect(auth.value.setProfile).toHaveBeenCalled())
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/profile/nameplates/select')!
    expect(JSON.parse(call[1].body)).toEqual({ nameplateId: 'gece' })
    expect(auth.value.setProfile.mock.calls[0][0]).toMatchObject({ selected_nameplate: 'gece' })
  })

  test('süs alanı: ücretsiz süs takma /select API POST eder + profil günceller', async () => {
    render(<KisisellestirClient />)
    fireEvent.click(screen.getByRole('button', { name: /Süs/ }))
    // Konfeti ücretsiz → takılabilir
    fireEvent.click(screen.getByText('Konfeti').closest('button')!)

    await waitFor(() => expect(auth.value.setProfile).toHaveBeenCalled())
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/profile/avatar-decorations/select')!
    expect(JSON.parse(call[1].body)).toEqual({ decorationIds: ['konfeti'] })
    expect(auth.value.setProfile.mock.calls[0][0]).toMatchObject({
      selected_avatar_decorations: ['konfeti'],
    })
  })

  test('süs alanı: sahip-olunmayan ücretli süs kilitli, sahip olunan takılabilir', () => {
    render(<KisisellestirClient />)
    fireEvent.click(screen.getByRole('button', { name: /Süs/ }))
    // Taç (crown, 600) owned değil → kilitli (disabled)
    expect(screen.getByText('Taç').closest('button')).toBeDisabled()
    // Altın Hale (aura) owned → takılabilir
    expect(screen.getByText('Altın Hale').closest('button')).not.toBeDisabled()
  })

  test('sahiplik filtresi: normal kullanıcı sahip-olmadığı ücretli temayı görmez', () => {
    render(<KisisellestirClient />)
    // Nebula (400 coin) owned_backgrounds'ta yok → grid'de görünmez
    expect(screen.queryByLabelText('Nebula')).not.toBeInTheDocument()
  })

  test('personel bypass: admin tüm ücretli temaları görür', () => {
    auth.value.profile = { ...(auth.value.profile as Record<string, unknown>), role: 'admin' }
    render(<KisisellestirClient />)
    expect(screen.getByLabelText('Nebula')).toBeInTheDocument()
  })

  test('misafir: giriş yönlendirmesi gösterir', () => {
    auth.value.user = null
    auth.value.profile = null
    render(<KisisellestirClient />)
    expect(screen.getByRole('link', { name: 'Giriş Yap' })).toHaveAttribute(
      'href',
      '/giris?redirect=/arena/kisisellestir',
    )
  })
})
