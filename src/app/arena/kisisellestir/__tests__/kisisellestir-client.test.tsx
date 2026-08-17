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
// getState: applyAvatar concurrent-clobber fix (Codex PR#243) en guncel store
// profilini useAuthStore.getState() ile okur — mock da saglamali.
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: Object.assign(() => auth.value, { getState: () => auth.value }),
}))

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
  test('başlık + alan sekmeleri render olur, varsayılan alan avatar', () => {
    render(<KisisellestirClient />)
    expect(screen.getByText('🎨 Kişiselleştirme Stüdyosu')).toBeInTheDocument()
    // Avatar artık ilk + varsayılan alan (en sık aranan kişiselleştirme — kullanıcı
    // "Kişiselleştir"e tıklayınca avatar seçici hemen önünde olsun).
    expect(screen.getByRole('button', { name: '🧑 Avatar' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '🌅 Zemin' })).toHaveAttribute('aria-pressed', 'false')
  })

  test('avatar alanı (varsayılan): hazır avatar seçimi preset API POST eder + profil günceller', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/profile/avatar/preset')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ avatar_url: '/avatars/mascot/chan-avatar-3d-smile.webp' }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ backgrounds: [], badges: [] }) })
    })
    render(<KisisellestirClient />)
    // Avatar varsayılan alan → galeri görünür; ilk "Bilge Chan" avatarını seç (Lv1, açık).
    // aria-label artık grup-içi benzersiz (Codex PR#243 a11y fix): "Bilge Chan avatar 1".
    fireEvent.click(screen.getByLabelText('Bilge Chan avatar 1'))

    await waitFor(() => expect(auth.value.setProfile).toHaveBeenCalled())
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/profile/avatar/preset')!
    expect(call).toBeTruthy()
    expect(JSON.parse(call[1].body)).toHaveProperty('presetId')
    expect(auth.value.setProfile.mock.calls[0][0]).toMatchObject({
      avatar_url: '/avatars/mascot/chan-avatar-3d-smile.webp',
    })
  })

  test('avatar kaydı EN GÜNCEL profili merge eder — eşzamanlı alanı ezmez (Codex PR#243)', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/profile/avatar/preset')) {
        // Yanıt dönmeden ÖNCE eşzamanlı bir nameplate kaydı olmuş gibi store'u güncelle.
        auth.value.profile = { ...(auth.value.profile as Record<string, unknown>), selected_nameplate: 'gece' }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ avatar_url: '/avatars/mascot/chan-avatar-3d-smile.webp' }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ backgrounds: [], badges: [] }) })
    })
    render(<KisisellestirClient />)
    fireEvent.click(screen.getByLabelText('Bilge Chan avatar 1'))

    await waitFor(() => expect(auth.value.setProfile).toHaveBeenCalled())
    // Bayat closure olsa selected_nameplate 'none'a dönerdi (clobber); fix EN GÜNCEL'i ('gece') korur.
    expect(auth.value.setProfile.mock.calls[0][0]).toMatchObject({
      selected_nameplate: 'gece',
      avatar_url: '/avatars/mascot/chan-avatar-3d-smile.webp',
    })
  })

  test('zemin seçimi ZEMIN anahtarına yazar + zemin-changed olayını tetikler (karta DEĞİL)', () => {
    const zeminSpy = vi.fn()
    window.addEventListener('zemin-changed', zeminSpy)
    render(<KisisellestirClient />)
    fireEvent.click(screen.getByRole('button', { name: '🌅 Zemin' }))
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

  // DAVRANIŞ DEĞİŞİKLİĞİ (2026-08-16, İP-3a): sahip olunmayan ürünler artık
  // GİZLENMİYOR, kilitli gösteriliyor. Sahiplik guard'ı duruyor (seçilemez),
  // değişen yalnız görünürlük — kullanıcı neyi alabileceğini göremiyordu.
  test('sahip olunmayan ücretli tema GÖRÜNÜR; bakiye yetiyorsa satın alınabilir', () => {
    // Bakiye 5000, Nebula 400 → kilitli ama alınabilir: tıklanabilir olmalı
    render(<KisisellestirClient />)
    fireEvent.click(screen.getByRole('button', { name: '🌅 Zemin' }))
    const nebula = screen.getByLabelText('Nebula')
    expect(nebula).toBeInTheDocument()
    expect(nebula).not.toBeDisabled()
  })

  test('bakiye yetmiyorsa kilitli ürün seçilemez (disabled)', () => {
    auth.value.profile = { ...(auth.value.profile as Record<string, unknown>), coin_balance: 10 }
    render(<KisisellestirClient />)
    fireEvent.click(screen.getByRole('button', { name: '🌅 Zemin' }))
    expect(screen.getByLabelText('Nebula')).toBeDisabled()
  })

  test('kilitli ürüne tıklayınca satın alma onayı açılır ve onaylanınca API çağrılır', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        coin_balance: 4600,
        owned_backgrounds: ['none', 'gece-mavisi', 'nebula'],
      }),
    })
    render(<KisisellestirClient />)
    fireEvent.click(screen.getByRole('button', { name: '🌅 Zemin' }))
    fireEvent.click(screen.getByLabelText('Nebula'))

    // Onay modalı açıldı
    expect(screen.getByRole('dialog', { name: 'Satın almayı onayla' })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Onayla'))

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]))
      expect(calls.some((u) => u.includes('/api/profile/backgrounds/purchase'))).toBe(true)
    })
  })

  test('bakiye yetiyorsa kilit-açık fiyat etiketi gösterilir', () => {
    // Bakiye 5000 → 400'lük temalar alınabilir (birden fazla tema aynı fiyatta)
    render(<KisisellestirClient />)
    fireEvent.click(screen.getByRole('button', { name: '🌅 Zemin' }))
    expect(screen.getAllByText('🔓 🪙400').length).toBeGreaterThan(0)
  })

  test('bakiye yetmiyorsa "ne kadar eksik" yazar', () => {
    auth.value.profile = { ...(auth.value.profile as Record<string, unknown>), coin_balance: 150 }
    render(<KisisellestirClient />)
    fireEvent.click(screen.getByRole('button', { name: '🌅 Zemin' }))
    // 400 - 150 = 250 daha gerekiyor
    expect(screen.getAllByText('🔒 🪙250 daha').length).toBeGreaterThan(0)
  })

  test('çerçeve alanı: sahip olunmayan çerçeve kilit etiketiyle listelenir', () => {
    auth.value.profile = { ...(auth.value.profile as Record<string, unknown>), coin_balance: 0 }
    render(<KisisellestirClient />)
    fireEvent.click(screen.getByRole('button', { name: /Çerçeve/ }))
    // Alev Çemberi (30) sahip değil, bakiye 0 → "30 daha"
    expect(screen.getByText('Alev Çemberi')).toBeInTheDocument()
    expect(screen.getByText('🔒 🪙30 daha')).toBeInTheDocument()
  })

  test('isim paneli: bakiye yetmiyorsa sahip olunmayan panel seçilemez', () => {
    auth.value.profile = { ...(auth.value.profile as Record<string, unknown>), coin_balance: 0 }
    render(<KisisellestirClient />)
    fireEvent.click(screen.getByRole('button', { name: /İsim Paneli/ }))
    const kilitli = screen.getAllByRole('button').filter((b) => b.hasAttribute('disabled'))
    expect(kilitli.length).toBeGreaterThan(0)
  })

  test('personel bypass: admin tüm ücretli temaları seçebilir', () => {
    auth.value.profile = { ...(auth.value.profile as Record<string, unknown>), role: 'admin' }
    render(<KisisellestirClient />)
    fireEvent.click(screen.getByRole('button', { name: '🌅 Zemin' }))
    const nebula = screen.getByLabelText('Nebula')
    expect(nebula).toBeInTheDocument()
    expect(nebula).not.toBeDisabled()
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
