import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from '../auth-store'
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
  is_premium: false,
  premium_until: null,
  preferred_theme: 'dark' as const,
  notifications: true,
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
