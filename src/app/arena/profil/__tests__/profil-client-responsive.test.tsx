import { render } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  value: { user: null, profile: null, loading: true } as {
    user: null | { id: string }
    profile: null | Record<string, unknown>
    loading: boolean
  },
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => auth.value,
}))

vi.mock('@/components/profile/card-background', () => ({
  useCardBackground: () => ({
    activeBackground: { id: 'none' },
    activeBgVideoUrl: null,
    isCssBg: false,
    reducedMotion: false,
  }),
  CardBackgroundLayer: () => null,
}))

import ProfilClient from '../profil-client'

describe('ProfilClient responsive kabuk', () => {
  beforeEach(() => {
    auth.value = { user: null, profile: null, loading: true }
  })

  test('mobil, tablet ve bilgisayar genişliklerini ayrı tanımlar', () => {
    const { container } = render(<ProfilClient />)
    const page = container.querySelector('[data-profile-screen]')

    expect(page).toHaveClass('max-w-[440px]', 'md:max-w-[760px]', 'lg:max-w-[1180px]')
    expect(container.textContent).toContain('@media (max-width: 1023px)')
  })

  test('masaustunde konu ilerlemesini sol akista tutarken mobil sirayi korur', () => {
    auth.value = {
      user: { id: 'user-1' },
      profile: {
        username: 'Arenaci',
        created_at: '2026-01-01T00:00:00.000Z',
        total_xp: 120,
        current_streak: 1,
        longest_streak: 2,
        coin_balance: 10,
        owned_frames: ['none'],
        selected_avatar_decorations: [],
        owned_cosmetic_badges: [],
      },
      loading: false,
    }

    const { container } = render(<ProfilClient />)
    const layout = container.querySelector('[data-profile-layout]')
    const mainColumn = container.querySelector('[data-profile-main-column]')
    const desktopTopics = container.querySelector('[data-profile-topic-desktop]')
    const sidebar = container.querySelector('[data-profile-sidebar]')
    const mobileTopics = container.querySelector('[data-profile-topic-mobile]')

    expect(layout).toHaveClass('lg:grid-cols-[minmax(0,1fr)_360px]')
    expect(desktopTopics).toHaveClass('hidden', 'lg:block')
    expect(mobileTopics).toHaveClass('lg:hidden')
    expect(mainColumn?.contains(desktopTopics)).toBe(true)
    expect(sidebar?.nextElementSibling).toBe(mobileTopics)
  })
})
