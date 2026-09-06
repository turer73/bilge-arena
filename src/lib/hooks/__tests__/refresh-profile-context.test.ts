import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ setProfile: vi.fn() }))
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: { getState: () => ({ setProfile: mocks.setProfile }) },
}))
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ setUser: vi.fn() }))
vi.mock('@/lib/utils/plausible', () => ({ trackEvent: vi.fn() }))
vi.mock('@/lib/hooks/use-guest-session', () => ({ resetGuestQuizCount: vi.fn() }))
import { refreshProfile } from '../use-auth'

describe('refreshProfile session context boundary', () => {
  const profile = { id: 'learner-a', total_xp: 360, role: 'user' }
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it('does not request a profile for an already stale completion', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await refreshProfile(() => false)
    expect(fetcher).not.toHaveBeenCalled()
    expect(mocks.setProfile).not.toHaveBeenCalled()
  })

  it('does not put the old profile in the global store after a context change', async () => {
    let resolveResponse!: (value: unknown) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { resolveResponse = resolve })))
    let current = true
    const pending = refreshProfile(() => current)
    current = false
    resolveResponse({ ok: true, json: async () => ({ profile, isAdmin: true }) })
    await pending
    expect(mocks.setProfile).not.toHaveBeenCalled()
  })

  it('retains the current context and existing unguarded callers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ profile, isAdmin: false }) })))
    await refreshProfile(() => true)
    await refreshProfile()
    expect(mocks.setProfile).toHaveBeenCalledTimes(2)
    expect(mocks.setProfile).toHaveBeenLastCalledWith(profile)
  })
})
