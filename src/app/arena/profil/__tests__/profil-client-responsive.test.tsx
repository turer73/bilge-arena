import { render } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({ user: null, profile: null, loading: true }),
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
  test('mobil, tablet ve bilgisayar genişliklerini ayrı tanımlar', () => {
    const { container } = render(<ProfilClient />)
    const page = container.querySelector('[data-profile-screen]')

    expect(page).toHaveClass('max-w-[440px]', 'md:max-w-[760px]', 'lg:max-w-[1180px]')
    expect(container.textContent).toContain('@media (max-width: 1023px)')
  })
})
