import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LeaderboardVisibilitySettings } from '../leaderboard-visibility-settings'

const mocks = vi.hoisted(() => ({
  profile: {
    id: '11111111-2222-4333-8444-555555555555',
    leaderboard_opt_in: false,
  },
  setProfile: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    profile: mocks.profile,
    setProfile: mocks.setProfile,
  }),
}))

vi.mock('@/stores/toast-store', () => ({
  toast: { success: mocks.success, error: mocks.error },
}))

describe('LeaderboardVisibilitySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.profile.leaderboard_opt_in = false
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      leaderboard_opt_in: true,
    }), { status: 200 })))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('starts private and explains exactly what becomes public', () => {
    render(<LeaderboardVisibilitySettings />)

    expect(screen.getByRole('switch', { name: 'Açık sıralamaya katılım' })).not.toBeChecked()
    expect(screen.getByText('Varsayılan: gizli')).toBeInTheDocument()
    expect(screen.getByText(/kullanıcı adın, avatarın, XP'n, seviyen/)).toBeInTheDocument()
  })

  it('sends an explicit boolean opt-in and updates the local profile', async () => {
    render(<LeaderboardVisibilitySettings />)
    fireEvent.click(screen.getByRole('switch', { name: 'Açık sıralamaya katılım' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/profile', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ leaderboard_opt_in: true }),
    })))
    expect(mocks.setProfile).toHaveBeenCalledWith(expect.objectContaining({ leaderboard_opt_in: true }))
    expect(mocks.success).toHaveBeenCalledWith('Açık sıralamaya isteğinle katıldın')
  })

  it('keeps the profile unchanged when the server rejects the preference', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })))
    render(<LeaderboardVisibilitySettings />)
    fireEvent.click(screen.getByRole('switch', { name: 'Açık sıralamaya katılım' }))

    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Sıralama tercihi güncellenemedi'))
    expect(mocks.setProfile).not.toHaveBeenCalled()
  })
})
