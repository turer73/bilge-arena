import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  profile: {
    username: 'arenaci',
    is_discoverable: true,
    profile_visibility: 'public',
  } as Record<string, unknown>,
  setProfile: vi.fn(),
}))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: typeof auth) => unknown) => selector(auth),
}))
vi.mock('@/stores/toast-store', () => ({ toast }))

import { DiscoverabilitySettings } from '../discoverability-settings'

describe('DiscoverabilitySettings', () => {
  beforeEach(() => {
    auth.profile = { username: 'arenaci', is_discoverable: true, profile_visibility: 'public' }
    auth.setProfile.mockReset()
    toast.success.mockReset()
    toast.error.mockReset()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('uc ayri hedef kitleyi ve profil baglantisini gosterir', () => {
    render(<DiscoverabilitySettings />)

    expect(screen.getByRole('radio', { name: /Sadece ben/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Arkadaşlarım/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Herkes/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('link', { name: 'Profilimi görüntüle' })).toHaveAttribute('href', '/u/arenaci')
  })

  it('profil hedef kitlesini arama tercihinden bagimsiz kaydeder', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)
    render(<DiscoverabilitySettings />)

    fireEvent.click(screen.getByRole('radio', { name: /Arkadaşlarım/ }))

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/profile', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ profile_visibility: 'friends' }),
    })))
    expect(auth.setProfile).toHaveBeenCalledWith(expect.objectContaining({
      is_discoverable: true,
      profile_visibility: 'friends',
    }))
  })

  it('arkadas aramasi anahtarini ayri kaydeder', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)
    render(<DiscoverabilitySettings />)

    fireEvent.click(screen.getByRole('switch', { name: 'Arkadaş aramasında görün' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/profile', expect.objectContaining({
      body: JSON.stringify({ is_discoverable: false }),
    })))
    expect(auth.setProfile).toHaveBeenCalledWith(expect.objectContaining({
      is_discoverable: false,
      profile_visibility: 'public',
    }))
  })

  it('sunucu reddederse yerel profili degistirmez', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    render(<DiscoverabilitySettings />)

    fireEvent.click(screen.getByRole('radio', { name: /Sadece ben/ }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(auth.setProfile).not.toHaveBeenCalled()
  })
})
