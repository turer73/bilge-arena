/**
 * Bilge Arena: BadgeStoreClient — kozmetik rozet mağazası UI.
 *
 * Satın alma sonrası store yazımı patchProfile ile yapılır: yalnız sunucunun
 * döndürdüğü alanlar (coin_balance, owned_cosmetic_badges) yamalanır. Render
 * anındaki profili yaymak, istek sürerken gelen taze değerleri (orn. XP) eski
 * kopyayla ezerdi; testler bunu kilitliyor.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { CosmeticBadgeRow } from '@/lib/constants/cosmetic-badges'

type MockProfile = Record<string, unknown>

const auth = vi.hoisted(() => ({
  value: {
    user: { id: 'u1' } as { id: string } | null,
    profile: null as Record<string, unknown> | null,
    setProfile: vi.fn(),
    patchProfile: vi.fn<(patch: Record<string, unknown>) => void>(),
  },
}))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => auth.value }))

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@/stores/toast-store', () => ({ toast: toastMock }))

import { BadgeStoreClient } from '../badge-store-client'

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

const PURCHASE_URL = '/api/profile/cosmetic-badges/purchase'

function row(slug: string, name: string, coinCost: number): CosmeticBadgeRow {
  return {
    id: `row-${slug}`,
    slug,
    name,
    description: `${name} açıklaması`,
    category: 'sezon',
    rarity: 'rare',
    coin_cost: coinCost,
    icon_url: null,
    is_published: true,
    created_at: '2026-01-01T00:00:00Z',
  }
}

/** Katalogdaki ilk rozet varsayılan seçilir: 'kartal' (sahipsiz, 200 coin). */
const BADGES = [row('kartal', 'Kartal', 200), row('yildiz', 'Yıldız', 50)]

const PURCHASE_RESPONSE = {
  success: true,
  badgeId: 'kartal',
  coin_balance: 300,
  owned_cosmetic_badges: ['yildiz', 'kartal'],
}

function baseProfile(): MockProfile {
  return {
    id: 'u1',
    username: 'Arenacı',
    total_xp: 100,
    coin_balance: 500,
    owned_cosmetic_badges: ['yildiz'],
    role: 'user',
  }
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) }
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.value.user = { id: 'u1' }
  auth.value.profile = baseProfile()
  // Gerçek store gibi: yama EN GÜNCEL profile birleştirilir.
  auth.value.patchProfile.mockImplementation((patch) => {
    if (auth.value.profile) auth.value.profile = { ...auth.value.profile, ...patch }
  })
  fetchMock.mockImplementation((url: string) =>
    Promise.resolve(
      url === PURCHASE_URL ? jsonResponse(PURCHASE_RESPONSE) : jsonResponse({ badges: BADGES }),
    ),
  )
})

async function buySelected() {
  await screen.findByLabelText('Kartal önizleme')
  fireEvent.click(screen.getByRole('button', { name: 'Şimdi Al' }))
  fireEvent.click(screen.getByRole('button', { name: 'Onayla' }))
}

describe('BadgeStoreClient', () => {
  test('katalog fiyatıyla listelenir, sahip olunan rozet işaretlenir', async () => {
    render(<BadgeStoreClient />)
    expect(await screen.findByLabelText('Kartal önizleme')).toBeInTheDocument()
    expect(screen.getByText('🪙200')).toBeInTheDocument()
    expect(screen.getByLabelText('Yıldız önizleme')).toHaveTextContent('✓ Sahipsin')
  })

  test('satın alma: yalnız sunucunun döndürdüğü alanlar yamalanır', async () => {
    render(<BadgeStoreClient />)
    await buySelected()

    await waitFor(() => expect(auth.value.patchProfile).toHaveBeenCalledOnce())
    const purchaseCall = fetchMock.mock.calls.find((c) => c[0] === PURCHASE_URL)!
    expect(JSON.parse(purchaseCall[1].body)).toEqual({ badgeId: 'kartal' })

    const patch = auth.value.patchProfile.mock.calls[0][0]
    expect(patch).toEqual({ coin_balance: 300, owned_cosmetic_badges: ['yildiz', 'kartal'] })
    expect(Object.keys(patch).sort()).toEqual(['coin_balance', 'owned_cosmetic_badges'])
    expect(auth.value.setProfile).not.toHaveBeenCalled()
    // Diğer profil alanları korunur
    expect(auth.value.profile).toEqual({
      ...baseProfile(),
      coin_balance: 300,
      owned_cosmetic_badges: ['yildiz', 'kartal'],
    })
    expect(toastMock.success).toHaveBeenCalled()
  })

  test('istek sürerken gelen taze XP, render anındaki eski profille ezilmez', async () => {
    let resolvePurchase!: (value: unknown) => void
    fetchMock.mockImplementation((url: string) =>
      url === PURCHASE_URL
        ? new Promise((resolve) => {
            resolvePurchase = resolve
          })
        : Promise.resolve(jsonResponse({ badges: BADGES })),
    )
    render(<BadgeStoreClient />)
    await buySelected()
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => c[0] === PURCHASE_URL)).toBe(true))

    // Satın alma sürerken store'a taze XP gelir (bileşen yeniden render olmadan).
    auth.value.profile = { ...auth.value.profile, total_xp: 250 }
    resolvePurchase(jsonResponse(PURCHASE_RESPONSE))

    await waitFor(() => expect(auth.value.patchProfile).toHaveBeenCalledOnce())
    expect(auth.value.profile).toMatchObject({
      total_xp: 250,
      coin_balance: 300,
      owned_cosmetic_badges: ['yildiz', 'kartal'],
    })
    expect(auth.value.setProfile).not.toHaveBeenCalled()
  })

  test('API hatası: profil yamalanmaz, hata toast gösterilir', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        url === PURCHASE_URL
          ? jsonResponse({ error: 'Yetersiz coin' }, false)
          : jsonResponse({ badges: BADGES }),
      ),
    )
    render(<BadgeStoreClient />)
    await buySelected()

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('Satın alınamadı', 'Yetersiz coin'))
    expect(auth.value.patchProfile).not.toHaveBeenCalled()
    expect(auth.value.setProfile).not.toHaveBeenCalled()
    expect(auth.value.profile).toEqual(baseProfile())
  })

  test('misafir: satın alma yerine giriş CTA', async () => {
    auth.value.user = null
    auth.value.profile = null
    render(<BadgeStoreClient />)
    await screen.findByLabelText('Kartal önizleme')
    expect(screen.getByRole('link', { name: 'Giriş Yap' })).toHaveAttribute(
      'href',
      '/giris?redirect=/arena/magaza',
    )
    expect(screen.queryByRole('button', { name: 'Şimdi Al' })).not.toBeInTheDocument()
  })
})
