/**
 * Bilge Arena: useAuth çekirdek akış smoke testleri (Codex follow-up #901).
 * Kapsam: oturum-var/yok başlangıcı, profil sync→GET fallback, auth-state
 * değişiminde logout temizliği, signOut. Analytics yan-yolları (Signup ve
 * Day2Return) en alttaki iki describe'da.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const sentry = vi.hoisted(() => ({ setUser: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ setUser: sentry.setUser }))

const store = vi.hoisted(() => {
  const s = {
    user: null as unknown,
    profile: null as unknown,
    loading: true,
    // Gercek store gibi state tutar: profil yuklemesi cevabi yalniz oturum
    // hala ayni kullanicidaysa uygular (isCurrentUser).
    setUser: vi.fn((user: unknown) => { s.user = user }),
    setProfile: vi.fn((profile: unknown) => { s.profile = profile }),
    setLoading: vi.fn(),
    signOut: vi.fn(() => { s.user = null; s.profile = null }),
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

import { trackEvent } from '@/lib/utils/plausible'
import { resetGuestQuizCount } from '@/lib/hooks/use-guest-session'
import { useAuth } from '../use-auth'

const AUTH_USER = { id: 'u1', email: 'test@test.com', app_metadata: { provider: 'google' } }
const PROFILE = { id: 'u1', username: 'test', is_premium: false, created_at: '2026-01-01T00:00:00Z' }

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

function jsonOk(data: Record<string, unknown>) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
}

/** Ucustaki tum (aninda cozulen mock) profil yuklemelerinin bitmesini bekler. */
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

const syncCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/profile/sync'))
const getCalls = () => fetchMock.mock.calls.filter(
  (c) => String(c[0]).includes('/api/profile') && !String(c[0]).includes('/sync'),
)

beforeEach(() => {
  vi.clearAllMocks()
  store.user = null
  store.profile = null
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

afterEach(async () => {
  // Modul seviyesindeki ucustaki yukleme bir sonraki teste sizmasin.
  await settle()
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

  test('kurum girisi: Google hesap secicisini zorlar', async () => {
    const { result } = renderHook(() => useAuth())

    await act(() => result.current.signInWithGoogle(
      '/arena/kurum',
      { forceAccountSelection: true },
    ))

    expect(supa.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=%2Farena%2Fkurum`,
        queryParams: { prompt: 'select_account' },
      },
    })
  })

  test('Google callback URL hukuki kabul niyetini tasir', async () => {
    const { result } = renderHook(() => useAuth())

    await act(() => result.current.signInWithGoogle('/arena', {
      legalConsentToken: 'signed.intent',
    }))

    expect(supa.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=%2Farena&legalConsent=signed.intent`,
        queryParams: undefined,
      },
    })
  })

  test('magic link kaydi: guvenli donus hedefini callback URL icinde korur', async () => {
    const { result } = renderHook(() => useAuth())

    await act(() => result.current.signInWithMagicLink(
      'student@example.com',
      '/arena/matematik?source=guest',
    ))

    expect(supa.signInWithOtp).toHaveBeenCalledWith({
      email: 'student@example.com',
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Farena%2Fmatematik%3Fsource%3Dguest`,
        shouldCreateUser: true,
      },
    })
  })

  test('magic-link callback URL hukuki kabul niyetini tasir', async () => {
    const { result } = renderHook(() => useAuth())

    await act(() => result.current.signInWithMagicLink(
      'student@example.com',
      '/arena',
      { legalConsentToken: 'signed.intent' },
    ))

    expect(supa.signInWithOtp).toHaveBeenCalledWith({
      email: 'student@example.com',
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Farena&legalConsent=signed.intent`,
        shouldCreateUser: true,
      },
    })
  })

  test('magic link kaydi: guvensiz donus hedefini arena ile degistirir', async () => {
    const { result } = renderHook(() => useAuth())

    await act(() => result.current.signInWithMagicLink(
      'student@example.com',
      'https://evil.example',
    ))

    expect(supa.signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        emailRedirectTo: `${window.location.origin}/auth/callback?next=%2Farena`,
      }),
    }))
  })

  test('unmount: auth aboneliği bırakılır', async () => {
    const { unmount } = renderHook(() => useAuth())
    await waitFor(() => expect(supa.authStateCb).not.toBeNull())
    unmount()
    expect(supa.unsubscribe).toHaveBeenCalledOnce()
  })
})

describe('useAuth signup analytics', () => {
  const signupCalls = () => vi.mocked(trackEvent).mock.calls.filter(([name]) => name === 'Signup')

  beforeEach(() => {
    localStorage.removeItem('signup_tracked_u1')
  })

  const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

  test('es zamanli profil yuklemeleri Signup eventini tek kez gonderir', async () => {
    const newUser = { ...AUTH_USER, created_at: minutesAgo(0), email_confirmed_at: minutesAgo(0) }
    supa.getUser.mockResolvedValue({ data: { user: newUser } })

    // Navbar + sayfa bileseni: iki useAuth ornegi, her biri getUser ile
    // yukler; Supabase'in INITIAL_SESSION bildirimi de ayni anda gelir.
    renderHook(() => useAuth())
    renderHook(() => useAuth())
    act(() => supa.authStateCb!('INITIAL_SESSION', { user: newUser }))

    await waitFor(() => expect(store.setProfile).toHaveBeenCalled())
    await settle()
    expect(signupCalls()).toEqual([['Signup', { props: { provider: 'google' } }]])
    expect(resetGuestQuizCount).toHaveBeenCalledOnce()
    expect(localStorage.getItem('signup_tracked_u1')).toBe('1')
  })

  test('magic link: e-posta 10 dk once istendi, link simdi tiklandi -> Signup', async () => {
    // Satir (ve profil) e-posta istendiginde acilir; onay linke tiklaninca dolar.
    const magicLinkUser = {
      ...AUTH_USER,
      app_metadata: { provider: 'email' },
      created_at: minutesAgo(10),
      email_confirmed_at: minutesAgo(0),
    }
    supa.getUser.mockResolvedValue({ data: { user: magicLinkUser } })

    renderHook(() => useAuth())

    await waitFor(() => expect(store.setProfile).toHaveBeenCalled())
    expect(signupCalls()).toEqual([['Signup', { props: { provider: 'magic_link' } }]])
  })

  test('eski hesap: flag yazilir, Signup gonderilmez, kayit icin ek /api/profile istegi yok', async () => {
    const returningUser = { ...AUTH_USER, created_at: minutesAgo(60 * 24), email_confirmed_at: minutesAgo(60 * 24) }
    supa.getUser.mockResolvedValue({ data: { user: returningUser } })

    renderHook(() => useAuth())

    await waitFor(() => expect(store.setProfile).toHaveBeenCalled())
    expect(localStorage.getItem('signup_tracked_u1')).toBe('1')
    expect(signupCalls()).toHaveLength(0)
    const plainProfileGets = fetchMock.mock.calls.filter(
      (c) => String(c[0]).includes('/api/profile') && !String(c[0]).includes('/sync'),
    )
    expect(plainProfileGets).toHaveLength(0)
  })
})

describe('useAuth Day2Return analytics', () => {
  const day2Calls = () => vi.mocked(trackEvent).mock.calls.filter(([name]) => name === 'Day2Return')
  const userConfirmedAt = (iso: string) => ({ ...AUTH_USER, created_at: iso, email_confirmed_at: iso })

  beforeEach(() => {
    // Yalniz Date sahte: waitFor'un zamanlayicilari gercek kalir.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-06T09:00:00Z')) // TR 6 Ekim 12:00
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('kayit gununu izleyen TR gununde tek Day2Return gider, sonraki yuklemelerde tekrar etmez', async () => {
    const user = userConfirmedAt('2026-10-05T15:00:00Z') // TR 5 Ekim 18:00
    supa.getUser.mockResolvedValue({ data: { user } })

    renderHook(() => useAuth())
    renderHook(() => useAuth())
    act(() => supa.authStateCb!('INITIAL_SESSION', { user }))
    await waitFor(() => expect(store.setProfile).toHaveBeenCalledTimes(1))
    await settle()

    renderHook(() => useAuth())
    await waitFor(() => expect(store.setProfile).toHaveBeenCalledTimes(2))

    expect(day2Calls()).toEqual([['Day2Return']])
    expect(localStorage.getItem('day2_return_tracked_u1')).toBe('1')
  })

  test.each([
    ['ayni TR gunu (UTC gunu farkli)', '2026-10-05T22:30:00Z'], // TR 6 Ekim 01:30
    ['kayittan 2 TR gunu sonra', '2026-10-04T09:00:00Z'],
    ['eski hesap', '2026-09-01T09:00:00Z'],
  ])('%s: Day2Return gitmez', async (_label, confirmedAt) => {
    // Eski mantik bu cihazda dunku bir ziyareti gorunce her donusu sayiyordu.
    localStorage.setItem('last_seen_u1', '2026-10-05')
    supa.getUser.mockResolvedValue({ data: { user: userConfirmedAt(confirmedAt) } })

    renderHook(() => useAuth())

    await waitFor(() => expect(store.setProfile).toHaveBeenCalled())
    expect(day2Calls()).toHaveLength(0)
    expect(localStorage.getItem('day2_return_tracked_u1')).toBeNull()
  })
})

describe('useAuth profil yukleme yarisi', () => {
  // Test erken duserse cozulmemis istek modul seviyesindeki single-flight
  // kaydini acik birakip sonraki testlere sizmasin.
  const unresolved: Array<(value: unknown) => void> = []
  afterEach(() => {
    unresolved.splice(0).forEach((resolve) => resolve({ ok: false, json: () => Promise.resolve({}) }))
  })

  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((r) => { resolve = r })
    unresolved.push(resolve as (value: unknown) => void)
    return { promise, resolve }
  }

  const okSync = (profile: Record<string, unknown> = PROFILE) =>
    ({ ok: true, json: () => Promise.resolve({ profile, isAdmin: false, updated: false }) })
  const okGet = (profile: Record<string, unknown> = PROFILE) =>
    ({ ok: true, json: () => Promise.resolve({ profile, isAdmin: false }) })

  test('es zamanli cagrilar tek sync istegini paylasir, profil bir kez yazilir', async () => {
    supa.getUser.mockResolvedValue({ data: { user: AUTH_USER } })

    // Navbar + sayfa bileseni + INITIAL_SESSION: ayni kullanici icin 3 cagri.
    renderHook(() => useAuth())
    renderHook(() => useAuth())
    act(() => supa.authStateCb!('INITIAL_SESSION', { user: AUTH_USER }))

    await waitFor(() => expect(store.setProfile).toHaveBeenCalled())
    await settle()
    expect(syncCalls()).toHaveLength(1)
    expect(getCalls()).toHaveLength(0)
    expect(store.setProfile).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem('profile_synced_u1')).toBe('1')
  })

  test('sync 429 alirsa es zamanli cagrilar tek GET fallback paylasir, flag yazilmaz', async () => {
    supa.getUser.mockResolvedValue({ data: { user: AUTH_USER } })
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/api/profile/sync')) {
        return Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) })
      }
      return jsonOk({ profile: PROFILE, isAdmin: false })
    })

    renderHook(() => useAuth())
    renderHook(() => useAuth())
    act(() => supa.authStateCb!('INITIAL_SESSION', { user: AUTH_USER }))

    await waitFor(() => expect(store.setProfile).toHaveBeenCalled())
    await settle()
    expect(syncCalls()).toHaveLength(1)
    expect(getCalls()).toHaveLength(1)
    expect(store.setProfile).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem('profile_synced_u1')).toBeNull()
  })

  test('yukleme bitince yeni olay yeni yukleme baslatir (sync yapildiysa GET)', async () => {
    supa.getUser.mockResolvedValue({ data: { user: AUTH_USER } })
    renderHook(() => useAuth())
    await waitFor(() => expect(store.setProfile).toHaveBeenCalledOnce())
    await settle()

    act(() => supa.authStateCb!('TOKEN_REFRESHED', { user: AUTH_USER }))

    await waitFor(() => expect(store.setProfile).toHaveBeenCalledTimes(2))
    expect(syncCalls()).toHaveLength(1)
    expect(getCalls()).toHaveLength(1)
  })

  test('istek ucarken cikis yapilirsa eski hesabin profili store a geri yazilmaz', async () => {
    const pendingSync = deferred<unknown>()
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/api/profile/sync')) return pendingSync.promise
      return jsonOk({ profile: PROFILE, isAdmin: false })
    })
    supa.getUser.mockResolvedValue({ data: { user: AUTH_USER } })
    renderHook(() => useAuth())
    act(() => supa.authStateCb!('INITIAL_SESSION', { user: AUTH_USER }))
    await waitFor(() => expect(syncCalls()).toHaveLength(1))
    await waitFor(() => expect(store.setUser).toHaveBeenCalledTimes(2)) // getUser.then de calisti
    expect(store.user).toEqual(AUTH_USER)

    act(() => supa.authStateCb!('SIGNED_OUT', null))
    expect(store.setProfile).toHaveBeenLastCalledWith(null)

    pendingSync.resolve({ ok: true, json: () => Promise.resolve({ profile: PROFILE, isAdmin: false, updated: false }) })
    await settle()

    expect(store.setProfile).toHaveBeenLastCalledWith(null)
    expect(store.profile).toBeNull()
  })

  test('sync beklerken gec gelen cagri (sekme odagi SIGNED_IN) ayni yuklemeye katilir', async () => {
    const pendingSync = deferred<unknown>()
    fetchMock.mockImplementation((url: string) => (
      String(url).includes('/api/profile/sync') ? pendingSync.promise : Promise.resolve(okGet())
    ))
    supa.getUser.mockResolvedValue({ data: { user: AUTH_USER } })
    renderHook(() => useAuth())
    act(() => supa.authStateCb!('INITIAL_SESSION', { user: AUTH_USER }))
    await settle() // sync hala ucusta, bir makro gorev gecti

    act(() => supa.authStateCb!('SIGNED_IN', { user: AUTH_USER }))
    await settle()
    expect(syncCalls()).toHaveLength(1)

    pendingSync.resolve(okSync())
    await settle()
    expect(syncCalls()).toHaveLength(1)
    expect(getCalls()).toHaveLength(0)
    expect(store.setProfile).toHaveBeenCalledOnce()
  })

  test('429 sonrasi GET beklerken gec gelen cagri yeni sync/GET baslatmaz', async () => {
    const pendingGet = deferred<unknown>()
    fetchMock.mockImplementation((url: string) => (
      String(url).includes('/api/profile/sync')
        ? Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) })
        : pendingGet.promise
    ))
    supa.getUser.mockResolvedValue({ data: { user: AUTH_USER } })
    renderHook(() => useAuth())
    act(() => supa.authStateCb!('INITIAL_SESSION', { user: AUTH_USER }))
    await settle()
    expect(getCalls()).toHaveLength(1)

    act(() => supa.authStateCb!('SIGNED_IN', { user: AUTH_USER }))
    await settle()
    expect([syncCalls().length, getCalls().length]).toEqual([1, 1])

    pendingGet.resolve(okGet())
    await settle()
    expect([syncCalls().length, getCalls().length]).toEqual([1, 1])
    expect(store.setProfile).toHaveBeenCalledOnce()
  })

  test('GET ucarken cikis yapilirsa eski hesabin profili store a geri yazilmaz', async () => {
    sessionStorage.setItem('profile_synced_u1', '1') // tekrar yuklemeler GET dalini kullanir
    const pendingGet = deferred<unknown>()
    fetchMock.mockImplementation(() => pendingGet.promise)
    supa.getUser.mockResolvedValue({ data: { user: AUTH_USER } })
    renderHook(() => useAuth())
    act(() => supa.authStateCb!('INITIAL_SESSION', { user: AUTH_USER }))
    await waitFor(() => expect(getCalls()).toHaveLength(1))
    await waitFor(() => expect(store.setUser).toHaveBeenCalledTimes(2))

    act(() => supa.authStateCb!('SIGNED_OUT', null))
    pendingGet.resolve(okGet())
    await settle()

    expect(store.setProfile).toHaveBeenLastCalledWith(null)
    expect(store.profile).toBeNull()
  })

  test('hesap degisirse eski hesabin gec gelen profili yeni hesabinkini ezmez', async () => {
    localStorage.setItem('signup_tracked_u2', '1')
    const u2 = { ...AUTH_USER, id: 'u2', email: 'other@test.com' }
    const pendingU1Sync = deferred<unknown>()
    let syncCount = 0
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/api/profile/sync')) {
        syncCount += 1
        return syncCount === 1 ? pendingU1Sync.promise : Promise.resolve(okSync({ id: 'u2', username: 'other' }))
      }
      return Promise.resolve(okGet())
    })
    supa.getUser.mockResolvedValue({ data: { user: AUTH_USER } })
    renderHook(() => useAuth())
    act(() => supa.authStateCb!('INITIAL_SESSION', { user: AUTH_USER }))
    await settle()

    act(() => supa.authStateCb!('SIGNED_IN', { user: u2 }))
    await settle()
    expect(store.profile).toMatchObject({ id: 'u2' })

    pendingU1Sync.resolve(okSync())
    await settle()
    expect(store.profile).toMatchObject({ id: 'u2' })
    expect(syncCalls()).toHaveLength(2) // farkli kullanicilar ayri yukleme
  })
})
