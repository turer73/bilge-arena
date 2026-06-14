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
})
