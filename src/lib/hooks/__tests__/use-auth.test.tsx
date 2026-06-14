/**
 * Bilge Arena: useAuth çekirdek akış smoke testleri (Codex follow-up #901).
 * Kapsam: oturum-var/yok başlangıcı, profil sync→GET fallback, auth-state
 * değişiminde logout temizliği, signOut. Analytics yan-yolları (signup/Day2)
 * bilinçli kapsam dışı — ayrı PR'lık iş.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const sentry = vi.hoisted(() => ({ setUser: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ setUser: sentry.setUser }))

const store = vi.hoisted(() => {
  const s = {
    user: null as unknown,
    profile: null as unknown,
    loading: true,
    setUser: vi.fn(),
    setProfile: vi.fn(),
    setLoading: vi.fn(),
    signOut: vi.fn(),
  }
  return s
})
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: Object.assign(() => store, { getState: () => store }),
}))

const supa = vi.hoisted(() => ({
  authStateCb: null as null | ((event: string, session: unknown) => void),
  getUser: vi.fn(),
  signOut: vi.fn().mockResolvedValue({}),
  signInWithOAuth: vi.fn().mockResolvedValue({}),
  signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
  unsubscribe: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getUser: supa.getUser,
      signOut: supa.signOut,
      signInWithOAuth: supa.signInWithOAuth,
      signInWithOtp: supa.signInWithOtp,
      onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
        supa.authStateCb = cb
        return { data: { subscription: { unsubscribe: supa.unsubscribe } } }
      },
    },
  }),
}))

vi.mock('@/lib/utils/plausible', () => ({ trackEvent: vi.fn() }))
vi.mock('@/lib/hooks/use-guest-session', () => ({ resetGuestQuizCount: vi.fn() }))

import { useAuth } from '../use-auth'

const AUTH_USER = { id: 'u1', email: 'test@test.com', app_metadata: { provider: 'google' } }
const PROFILE = { id: 'u1', username: 'test', is_premium: false, created_at: '2026-01-01T00:00:00Z' }

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

function jsonOk(data: Record<string, unknown>) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  sessionStorage.clear() // profile_synced_* guard'i testler arasi sizmasin
  // signup-analytics yan-yolunu sustur: kullanici "eski" gorunsun
  localStorage.setItem('signup_tracked_u1', '1')
  supa.authStateCb = null
  supa.getUser.mockResolvedValue({ data: { user: null } })
  fetchMock.mockImplementation((url: string) => {
    if (String(url).includes('/api/profile/sync')) {
      return jsonOk({ profile: PROFILE, isAdmin: false, updated: false })
    }
    return jsonOk({ profile: PROFILE, isAdmin: false })
  })
})

describe('useAuth', () => {
  test('oturum yok: setUser(null) + loading kapanır, Sentry dokunulmaz', async () => {
    renderHook(() => useAuth())
    await waitFor(() => expect(store.setLoading).toHaveBeenCalledWith(false))
    expect(store.setUser).toHaveBeenCalledWith(null)
    expect(sentry.setUser).not.toHaveBeenCalled()
  })

  test('oturum var: user + Sentry set, sync ile profil yüklenir (role bind)', async () => {
    supa.getUser.mockResolvedValue({ data: { user: AUTH_USER } })
    renderHook(() => useAuth())

    await waitFor(() => expect(store.setProfile).toHaveBeenCalled())
    expect(store.setUser).toHaveBeenCalledWith(AUTH_USER)
    expect(sentry.setUser).toHaveBeenCalledWith({ id: 'u1', email: 'test@test.com' })
    const profileArg = store.setProfile.mock.calls.at(-1)![0]
    expect(profileArg).toMatchObject({ id: 'u1', role: 'user' })
  })

  test('oturum başına 1 sync: flag varsa sync atlanır, GET ile yüklenir', async () => {
    supa.getUser.mockResolvedValue({ data: { user: AUTH_USER } })
    sessionStorage.setItem('profile_synced_u1', '1') // önceki yükleme sync etmiş
    renderHook(() => useAuth())

    await waitFor(() => expect(store.setProfile).toHaveBeenCalled())
    const calledSync = fetchMock.mock.calls.some((c) => String(c[0]).includes('/api/profile/sync'))
    const calledGet = fetchMock.mock.calls.some(
      (c) => String(c[0]).includes('/api/profile') && !String(c[0]).includes('/sync'),
    )
    expect(calledSync).toBe(false)
    expect(calledGet).toBe(true)
  })

  test('sync endpoint düşerse GET /api/profile fallback çalışır', async () => {
    supa.getUser.mockResolvedValue({ data: { user: AUTH_USER } })
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/api/profile/sync')) {
        return Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
      }
      return jsonOk({ profile: PROFILE, isAdmin: true })
    })

    renderHook(() => useAuth())
    await waitFor(() => expect(store.setProfile).toHaveBeenCalled())
    const profileArg = store.setProfile.mock.calls.at(-1)![0]
    expect(profileArg).toMatchObject({ id: 'u1', role: 'admin' })
  })

  test('auth-state logout: user/profil temizlenir, Sentry sıfırlanır', async () => {
    supa.getUser.mockResolvedValue({ data: { user: AUTH_USER } })
    renderHook(() => useAuth())
    await waitFor(() => expect(supa.authStateCb).not.toBeNull())

    act(() => supa.authStateCb!('SIGNED_OUT', null))
    expect(store.setUser).toHaveBeenLastCalledWith(null)
    expect(store.setProfile).toHaveBeenLastCalledWith(null)
    expect(sentry.setUser).toHaveBeenLastCalledWith(null)
  })

  test('signOut: Supabase signOut + store temizliği', async () => {
    const { result } = renderHook(() => useAuth())
    await act(() => result.current.signOut())
    expect(supa.signOut).toHaveBeenCalledOnce()
    expect(store.signOut).toHaveBeenCalledOnce()
  })

  test('unmount: auth aboneliği bırakılır', async () => {
    const { unmount } = renderHook(() => useAuth())
    await waitFor(() => expect(supa.authStateCb).not.toBeNull())
    unmount()
    expect(supa.unsubscribe).toHaveBeenCalledOnce()
  })
})
