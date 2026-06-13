/**
 * Bilge Arena: GlobalBackground — sayfa zemini.
 * Zemin seçimi KARTTAN ayrı: ZEMIN_STORAGE_KEY okunur (BACKGROUND_STORAGE_KEY
 * DEĞİL). Varsayılan 'none' → hiçbir şey çizilmez (otomatik zemin kaldırıldı).
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({ usePathname: () => '/arena/siralama' }))

const auth = vi.hoisted(() => ({
  value: { profile: { owned_backgrounds: ['none'], role: 'user' } as Record<string, unknown> | null },
}))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: typeof auth.value) => unknown) => selector(auth.value),
}))

import { GlobalBackground } from '../global-background'

const fetchMock = vi.fn(() =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({ backgrounds: [] }) }),
)
global.fetch = fetchMock as unknown as typeof fetch

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  auth.value.profile = { owned_backgrounds: ['none'], role: 'user' }
})

describe('GlobalBackground (zemin)', () => {
  test('varsayılan: zemin seçili değil → hiçbir şey render edilmez', () => {
    const { container } = render(<GlobalBackground />)
    expect(container.firstChild).toBeNull()
  })

  test('KART anahtarı zemini ETKİLEMEZ (ayrışma)', () => {
    // Eskiden bu davranış zemine yansırdı; artık yansımamalı.
    localStorage.setItem('bilge-arena-profile-background-v1', 'gece-mavisi')
    const { container } = render(<GlobalBackground />)
    expect(container.firstChild).toBeNull()
  })

  test('ZEMIN anahtarı ayarlıysa ücretsiz tema zemine uygulanır', async () => {
    localStorage.setItem('bilge-arena-zemin-v1', 'gece-mavisi')
    const { container } = render(<GlobalBackground />)
    await waitFor(() => expect(container.querySelector('.fixed')).toBeTruthy())
  })
})
