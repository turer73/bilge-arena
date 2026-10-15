import { describe, it, expect, beforeEach } from 'vitest'
import { createProfileWriteGate, useAuthStore } from '../auth-store'
import type { User } from '@supabase/supabase-js'

const mockUser = { id: 'user-123', email: 'test@bilgearena.com' } as User
const mockProfile = {
  id: 'user-123',
  username: 'testuser',
  display_name: 'Test Kullanici',
  avatar_url: null,
  city: null,
  grade: null,
  role: 'user' as const,
  total_xp: 1500,
  level: 2,
  level_name: 'Cirak',
  current_streak: 3,
  longest_streak: 7,
  last_played_at: null,
  total_questions: 50,
  correct_answers: 35,
  total_sessions: 10,
  coin_balance: 0,
  owned_frames: ['none', 'mavi'],
  owned_backgrounds: ['none', 'gece-mavisi'],
  owned_nameplates: ['none'],
  selected_nameplate: 'none',
  owned_cosmetic_badges: [],
  owned_avatar_decorations: [],
  selected_avatar_decorations: [],
  is_premium: false,
  premium_until: null,
  preferred_theme: 'dark' as const,
  notifications: true,
  is_discoverable: true,
  referral_code: null,
  referred_by: null,
  onboarding_completed: true,
  created_at: '2024-01-01',
  updated_at: '2024-06-01',
}

describe('auth-store', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, profile: null, loading: true })
  })

  it('baslangicta loading true, user/profile null olmali', () => {
    const s = useAuthStore.getState()
    expect(s.loading).toBe(true)
    expect(s.user).toBeNull()
    expect(s.profile).toBeNull()
  })

  it('setUser kullanici atamali', () => {
    useAuthStore.getState().setUser(mockUser)
    expect(useAuthStore.getState().user?.id).toBe('user-123')
  })

  it('setProfile profil atamali', () => {
    useAuthStore.getState().setProfile(mockProfile)
    expect(useAuthStore.getState().profile?.username).toBe('testuser')
    expect(useAuthStore.getState().profile?.total_xp).toBe(1500)
  })

  it('setLoading yukleme durumunu degistirmeli', () => {
    useAuthStore.getState().setLoading(false)
    expect(useAuthStore.getState().loading).toBe(false)
  })

  it('signOut user ve profile temizlemeli', () => {
    useAuthStore.getState().setUser(mockUser)
    useAuthStore.getState().setProfile(mockProfile)
    useAuthStore.getState().signOut()

    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().profile).toBeNull()
  })
})

describe('createProfileWriteGate', () => {
  const base = { ...mockProfile, total_xp: 100 }

  it('sonra baslayan uygulandiysa once baslayanin cevabi reddedilir', () => {
    const gate = createProfileWriteGate()
    const older = gate.begin()
    const newer = gate.begin()
    expect(gate.resolve(newer, base)).toEqual(base)
    expect(gate.resolve(older, base)).toBeNull()
  })

  it('cevaplar baslama sirasiyla gelirse ikisi de uygulanir', () => {
    const gate = createProfileWriteGate()
    const first = gate.begin()
    const second = gate.begin()
    expect(gate.resolve(first, base)).toEqual(base)
    expect(gate.resolve(second, { ...base, total_xp: 150 })).toMatchObject({ total_xp: 150 })
  })

  it('istek ucarken yama: cevabin taze alanlari uygulanir, yamanin alani korunur', () => {
    const gate = createProfileWriteGate()
    const ticket = gate.begin()
    gate.markPatch(base.id, { preferred_theme: 'light' })

    const fetched = { ...base, total_xp: 150, preferred_theme: 'dark' as const }
    expect(gate.resolve(ticket, fetched)).toEqual({ ...fetched, preferred_theme: 'light' })
  })

  it('yamadan SONRA baslayan istek tamamen uygulanir', () => {
    const gate = createProfileWriteGate()
    gate.markPatch(base.id, { preferred_theme: 'light' })
    const ticket = gate.begin()

    const fetched = { ...base, preferred_theme: 'dark' as const }
    expect(gate.resolve(ticket, fetched)).toEqual(fetched)
  })

  it('baska hesabin yamasi uygulanmaz', () => {
    const gate = createProfileWriteGate()
    const ticket = gate.begin()
    gate.markPatch('other-user', { preferred_theme: 'light' })

    expect(gate.resolve(ticket, { ...base, preferred_theme: 'dark' })).toMatchObject({ preferred_theme: 'dark' })
  })

  it('sifirlama ondan once baslamis istegi tamamen reddeder ve yamalari unutur', () => {
    const gate = createProfileWriteGate()
    gate.markPatch(base.id, { preferred_theme: 'light' })
    const before = gate.begin()
    gate.markReset()
    const after = gate.begin()

    expect(gate.resolve(before, base)).toBeNull()
    expect(gate.resolve(after, { ...base, preferred_theme: 'dark' })).toMatchObject({ preferred_theme: 'dark' })
  })
})

describe('auth-store profil yazim sirasi', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, profile: null, loading: true })
  })

  it('istek ucarken patchProfile: tema korunur, cevabin taze XP si uygulanir', () => {
    useAuthStore.getState().setProfile(mockProfile)
    const ticket = useAuthStore.getState().beginProfileFetch()
    useAuthStore.getState().patchProfile({ preferred_theme: 'light' })

    const applied = useAuthStore.getState()
      .applyFetchedProfile(ticket, { ...mockProfile, total_xp: 1600, preferred_theme: 'dark' })

    expect(applied).toBe(true)
    expect(useAuthStore.getState().profile).toMatchObject({ total_xp: 1600, preferred_theme: 'light' })
  })

  it('yama guncel profile uygulanir: araya giren taze alanlar korunur, eski deger sabitlenmez', () => {
    useAuthStore.getState().setProfile({ ...mockProfile, total_xp: 100 })
    const inflight = useAuthStore.getState().beginProfileFetch() // yamadan once basladi
    const landed = useAuthStore.getState().beginProfileFetch()
    useAuthStore.getState().applyFetchedProfile(landed, { ...mockProfile, total_xp: 150 })

    useAuthStore.getState().patchProfile({ leaderboard_opt_in: true }) // eski kopyayi yaymaz
    expect(useAuthStore.getState().profile).toMatchObject({ total_xp: 150, leaderboard_opt_in: true })

    // landed'dan once baslamis istek zaten eski; daha yeni bir istek taze XP getirir
    expect(useAuthStore.getState().applyFetchedProfile(inflight, mockProfile)).toBe(false)
    // Yamadan sonra baslayan istek, sunucuda commit edilmis tercihi de getirir.
    const next = useAuthStore.getState().beginProfileFetch()
    useAuthStore.getState().applyFetchedProfile(next, { ...mockProfile, total_xp: 170, leaderboard_opt_in: true })
    expect(useAuthStore.getState().profile).toMatchObject({ total_xp: 170, leaderboard_opt_in: true })
  })

  it('profil yuklenmeden secilen tema ilk gelen profile uygulanir', () => {
    useAuthStore.getState().setUser({ id: mockProfile.id } as User)
    const ticket = useAuthStore.getState().beginProfileFetch() // sayfa acilisi yuklemesi
    useAuthStore.getState().patchProfile({ preferred_theme: 'light' })
    expect(useAuthStore.getState().profile).toBeNull()

    useAuthStore.getState().applyFetchedProfile(ticket, { ...mockProfile, preferred_theme: 'dark' })

    expect(useAuthStore.getState().profile?.preferred_theme).toBe('light')
  })

  it('signOut ucustaki istegin profili geri yazmasini engeller', () => {
    useAuthStore.getState().setProfile(mockProfile)
    const ticket = useAuthStore.getState().beginProfileFetch()
    useAuthStore.getState().signOut()

    expect(useAuthStore.getState().applyFetchedProfile(ticket, mockProfile)).toBe(false)
    expect(useAuthStore.getState().profile).toBeNull()
  })

  it('setProfile(null) (SIGNED_OUT olayi) ucustaki istegi gecersiz kilar', () => {
    useAuthStore.getState().setProfile(mockProfile)
    const ticket = useAuthStore.getState().beginProfileFetch()
    useAuthStore.getState().setUser(null)
    useAuthStore.getState().setProfile(null)

    expect(useAuthStore.getState().applyFetchedProfile(ticket, mockProfile)).toBe(false)
    expect(useAuthStore.getState().profile).toBeNull()
  })

  it('ayni hesapta setProfile sifirlama degildir: ucustaki istek uygulanir', () => {
    useAuthStore.getState().setProfile(mockProfile)
    const ticket = useAuthStore.getState().beginProfileFetch()
    useAuthStore.getState().setProfile({ ...mockProfile, total_xp: 1550 })

    expect(useAuthStore.getState().applyFetchedProfile(ticket, { ...mockProfile, total_xp: 1600 })).toBe(true)
    expect(useAuthStore.getState().profile?.total_xp).toBe(1600)
  })

  it('setProfile ile baska hesaba gecis de sifirlamadir', () => {
    useAuthStore.getState().setProfile(mockProfile)
    const ticket = useAuthStore.getState().beginProfileFetch()
    useAuthStore.getState().setProfile({ ...mockProfile, id: 'other-user' })

    expect(useAuthStore.getState().applyFetchedProfile(ticket, mockProfile)).toBe(false)
    expect(useAuthStore.getState().profile?.id).toBe('other-user')
  })

  it('gecerli bilet profili uygular', () => {
    const ticket = useAuthStore.getState().beginProfileFetch()

    expect(useAuthStore.getState().applyFetchedProfile(ticket, mockProfile)).toBe(true)
    expect(useAuthStore.getState().profile?.total_xp).toBe(1500)
  })
})
