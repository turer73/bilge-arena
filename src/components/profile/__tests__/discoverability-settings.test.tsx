import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => {
  const state = {
    profile: {
      username: 'arenaci',
      is_discoverable: true,
      profile_visibility: 'public',
    } as Record<string, unknown>,
    // Gercek store gibi: yama guncel profilin uzerine birlesir.
    patchProfile: vi.fn((patch: Record<string, unknown>) => {
      state.profile = { ...state.profile, ...patch }
    }),
  }
  return state
})
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: typeof auth) => unknown) => selector(auth),
}))
vi.mock('@/stores/toast-store', () => ({ toast }))

import { DiscoverabilitySettings } from '../discoverability-settings'

describe('DiscoverabilitySettings', () => {
  beforeEach(() => {
    auth.profile = { username: 'arenaci', is_discoverable: true, profile_visibility: 'public' }
    auth.patchProfile.mockClear()
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
    await waitFor(() => expect(auth.patchProfile).toHaveBeenCalledTimes(1))
    // Yama yalniz gonderilen alani tasir; arama tercihi korunur.
    expect(auth.patchProfile).toHaveBeenCalledWith({ profile_visibility: 'friends' })
    expect(auth.profile).toEqual({
      username: 'arenaci',
      is_discoverable: true,
      profile_visibility: 'friends',
    })
  })

  it('arkadas aramasi anahtarini ayri kaydeder', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response)
    render(<DiscoverabilitySettings />)

    fireEvent.click(screen.getByRole('switch', { name: 'Arkadaş aramasında görün' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/profile', expect.objectContaining({
      body: JSON.stringify({ is_discoverable: false }),
    })))
    await waitFor(() => expect(auth.patchProfile).toHaveBeenCalledTimes(1))
    // Yama yalniz gonderilen alani tasir; hedef kitle korunur.
    expect(auth.patchProfile).toHaveBeenCalledWith({ is_discoverable: false })
    expect(auth.profile).toEqual({
      username: 'arenaci',
      is_discoverable: false,
      profile_visibility: 'public',
    })
  })

  it('istek surerken gelen taze alanlari eski profil kopyasiyla ezmez', async () => {
    let resolveFetch: (value: Response) => void = () => {}
    vi.mocked(fetch).mockReturnValue(new Promise<Response>((resolve) => { resolveFetch = resolve }))
    render(<DiscoverabilitySettings />)

    fireEvent.click(screen.getByRole('switch', { name: 'Arkadaş aramasında görün' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    // Istek ucustayken sunucudan taze XP gelir.
    auth.profile = { ...auth.profile, total_xp: 500 }
    resolveFetch({ ok: true } as Response)

    await waitFor(() => expect(auth.patchProfile).toHaveBeenCalledWith({ is_discoverable: false }))
    expect(auth.profile).toEqual({
      username: 'arenaci',
      is_discoverable: false,
      profile_visibility: 'public',
      total_xp: 500,
    })
  })

  it('sunucu reddederse yerel profili degistirmez', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response)
    render(<DiscoverabilitySettings />)

    fireEvent.click(screen.getByRole('radio', { name: /Sadece ben/ }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(auth.patchProfile).not.toHaveBeenCalled()
    expect(auth.profile).toEqual({ username: 'arenaci', is_discoverable: true, profile_visibility: 'public' })
  })
})
