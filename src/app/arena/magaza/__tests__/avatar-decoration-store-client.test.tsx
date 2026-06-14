/**
 * AvatarDecorationStoreClient — avatar süsü mağazası (ÇOKLU). Ücretsiz/sahip süs
 * Tak/Çıkar → /select; sahipsiz ücretli → satın al (onay modalı) → /purchase +
 * otomatik tak. Seçim DB'de (başkalarına görünür).
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
      coin_balance: 5000,
      owned_avatar_decorations: ['aura'] as string[],
      selected_avatar_decorations: [] as string[],
      role: 'user',
    } as Record<string, unknown> | null,
    setProfile: vi.fn(),
  },
}))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => auth.value }))

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@/stores/toast-store', () => ({ toast: toastMock }))

import { AvatarDecorationStoreClient } from '../avatar-decoration-store-client'

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

beforeEach(() => {
  vi.clearAllMocks()
  auth.value.user = { id: 'u1' }
  auth.value.profile = {
    username: 'Arenacı',
    display_name: 'Arenacı',
    avatar_url: null,
    coin_balance: 5000,
    owned_avatar_decorations: ['aura'],
    selected_avatar_decorations: [],
    role: 'user',
  }
  fetchMock.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/purchase')) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            decorationId: 'crown',
            coin_balance: 4400,
            owned_avatar_decorations: ['aura', 'crown'],
          }),
      })
    }
    // /select
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) })
  })
})

describe('AvatarDecorationStoreClient', () => {
  test('katalog render olur (ücretsiz + ücretli süsler)', () => {
    render(<AvatarDecorationStoreClient />)
    expect(screen.getByLabelText('Konfeti önizleme')).toBeInTheDocument()
    expect(screen.getByLabelText('Taç önizleme')).toBeInTheDocument()
  })

  test('ücretsiz süs Tak → /select POST + profil günceller', async () => {
    render(<AvatarDecorationStoreClient />)
    // varsayılan seçili = konfeti (ücretsiz) → detayda "Tak"
    fireEvent.click(screen.getByRole('button', { name: 'Tak' }))

    await waitFor(() => expect(auth.value.setProfile).toHaveBeenCalled())
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/profile/avatar-decorations/select')!
    expect(JSON.parse(call[1].body)).toEqual({ decorationIds: ['konfeti'] })
    expect(auth.value.setProfile.mock.calls[0][0]).toMatchObject({
      selected_avatar_decorations: ['konfeti'],
    })
  })

  test('sahipsiz ücretli süs: satın al akışı (/purchase + otomatik tak)', async () => {
    render(<AvatarDecorationStoreClient />)
    fireEvent.click(screen.getByLabelText('Taç önizleme')) // crown seç (sahipsiz)
    fireEvent.click(screen.getByRole('button', { name: 'Şimdi Al' }))
    // onay modalı
    fireEvent.click(screen.getByRole('button', { name: 'Onayla' }))

    await waitFor(() => expect(auth.value.setProfile).toHaveBeenCalled())
    const buyCall = fetchMock.mock.calls.find((c) => c[0] === '/api/profile/avatar-decorations/purchase')!
    expect(JSON.parse(buyCall[1].body)).toEqual({ decorationId: 'crown' })
    expect(auth.value.setProfile.mock.calls.at(-1)![0]).toMatchObject({ coin_balance: 4400 })
  })

  test('profil geç gelince worn senkronize olur, mevcut süsü silmez (Codex P2 regresyon)', async () => {
    const base = {
      username: 'Arenacı',
      display_name: 'Arenacı',
      avatar_url: null,
      coin_balance: 5000,
      owned_avatar_decorations: ['aura'],
      role: 'user',
    }
    // İlk render: profil henüz süssüz (initializer [] yakalar)
    auth.value.profile = { ...base, selected_avatar_decorations: [] }
    const { rerender } = render(<AvatarDecorationStoreClient />)
    // Profil sonradan takılı süsle gelir → effect worn'u ['aura']'ya senkronize etmeli
    auth.value.profile = { ...base, selected_avatar_decorations: ['aura'] }
    rerender(<AvatarDecorationStoreClient />)
    // Konfeti ekle → aura KORUNMALI (stale [] olsa ['konfeti'] giderdi)
    fireEvent.click(screen.getByLabelText('Konfeti önizleme'))
    fireEvent.click(screen.getByRole('button', { name: 'Tak' }))

    await waitFor(() => expect(auth.value.setProfile).toHaveBeenCalled())
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/profile/avatar-decorations/select')!
    expect(JSON.parse(call[1].body)).toEqual({ decorationIds: ['aura', 'konfeti'] })
  })

  test('takılı süsü Çıkar → /select [] yazar', async () => {
    auth.value.profile = {
      ...(auth.value.profile as Record<string, unknown>),
      selected_avatar_decorations: ['konfeti'],
    }
    render(<AvatarDecorationStoreClient />)
    // konfeti varsayılan seçili + takılı → detayda "Çıkar"
    fireEvent.click(screen.getByRole('button', { name: 'Çıkar' }))
    await waitFor(() => expect(auth.value.setProfile).toHaveBeenCalled())
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/profile/avatar-decorations/select')!
    expect(JSON.parse(call[1].body)).toEqual({ decorationIds: [] })
  })

  test('/select hata → worn geri alınır + toast.error, profil güncellenmez', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'fail' }) }),
    )
    render(<AvatarDecorationStoreClient />)
    fireEvent.click(screen.getByRole('button', { name: 'Tak' }))
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled())
    expect(auth.value.setProfile).not.toHaveBeenCalled()
  })

  test('misafir (user yok): Giriş Yap linki', () => {
    auth.value.user = null
    render(<AvatarDecorationStoreClient />)
    expect(screen.getByRole('link', { name: 'Giriş Yap' })).toHaveAttribute(
      'href',
      '/giris?redirect=/arena/magaza',
    )
  })

  test('yetersiz coin: sahipsiz ücretli süs butonu disabled', () => {
    auth.value.profile = { ...(auth.value.profile as Record<string, unknown>), coin_balance: 100 }
    render(<AvatarDecorationStoreClient />)
    fireEvent.click(screen.getByLabelText('Taç önizleme')) // crown 600 > 100
    expect(screen.getByRole('button', { name: 'Yetersiz Coin' })).toBeDisabled()
  })

  test('satın alma hata → toast.error, profil güncellenmez', async () => {
    fetchMock.mockImplementation((url: string) =>
      url.includes('/purchase')
        ? Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'yetersiz' }) })
        : Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) }),
    )
    render(<AvatarDecorationStoreClient />)
    fireEvent.click(screen.getByLabelText('Taç önizleme'))
    fireEvent.click(screen.getByRole('button', { name: 'Şimdi Al' }))
    fireEvent.click(screen.getByRole('button', { name: 'Onayla' }))
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled())
    expect(auth.value.setProfile).not.toHaveBeenCalled()
  })

  test('onay modalı Vazgeç → satın alma çağrılmaz', () => {
    render(<AvatarDecorationStoreClient />)
    fireEvent.click(screen.getByLabelText('Taç önizleme'))
    fireEvent.click(screen.getByRole('button', { name: 'Şimdi Al' }))
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }))
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/purchase'))).toBe(false)
  })
})
