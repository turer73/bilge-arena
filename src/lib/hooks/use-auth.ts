'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import { trackEvent } from '@/lib/utils/plausible'
import { resetGuestQuizCount } from '@/lib/hooks/use-guest-session'
import type { Profile } from '@/types/database'

interface ProfileApiResponse {
  profile: Profile
  isAdmin: boolean
}

interface ProfileSyncResponse extends ProfileApiResponse {
  updated: boolean
}

/**
 * Profile API'sinden veriyi cek (Madde 9 #5: browser->Supabase yerine /api/profile).
 * Sessizce null doner — hata caller tarafindan log'lanmali.
 */
async function fetchProfileFromApi(): Promise<ProfileApiResponse | null> {
  try {
    const res = await fetch('/api/profile', { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as ProfileApiResponse
  } catch {
    return null
  }
}

/**
 * Google metadata ile profili senkronize et — display_name + avatar_url update.
 * Metadata server-side `auth.getUser()` ile alinir; istemciden gonderilmez.
 */
async function syncProfileFromApi(): Promise<ProfileSyncResponse | null> {
  try {
    const res = await fetch('/api/profile/sync', {
      method: 'POST',
      cache: 'no-store',
    })
    if (!res.ok) return null
    return (await res.json()) as ProfileSyncResponse
  } catch {
    return null
  }
}

/**
 * API'den gelen profile + isAdmin'i Profile tipine bind eder.
 * role alani UI'da kullanildigi icin 'admin' | 'user' string'ine map ediliyor.
 */
function applyRole(profile: Profile, isAdmin: boolean): Profile {
  return {
    ...profile,
    role: isAdmin ? 'admin' : (profile.role || 'user'),
  } as Profile
}

/**
 * Profil verisini API'den yeniden ceker ve auth-store'u gunceller.
 * Hook disinda da cagirilabilir (ornegin session save sonrasi).
 * DB trigger'lari XP/level/streak guncelledikten sonra cagrilmali.
 */
export async function refreshProfile(): Promise<void> {
  const data = await fetchProfileFromApi()
  if (!data) return
  useAuthStore.getState().setProfile(applyRole(data.profile, data.isAdmin))
}

export function useAuth() {
  const { user, profile, loading, setUser, setProfile, setLoading } = useAuthStore()
  const supabase = createClient()

  useEffect(() => {
    // Mevcut oturumu kontrol et (getUser ile JWT dogrulanir, getSession guvenli degil)
    supabase.auth.getUser().then(({ data: { user: authUser } }) => {
      setUser(authUser ?? null)
      if (authUser) {
        Sentry.setUser({ id: authUser.id, email: authUser.email })
        fetchProfileWithSync(authUser).catch((err) => {
          console.error('[useAuth] fetchProfile hatasi:', err)
        })
      }
      setLoading(false)
    }).catch(() => {
      setLoading(false)
    })

    // Auth degisikliklerini dinle
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        Sentry.setUser({ id: session.user.id, email: session.user.email })
        fetchProfileWithSync(session.user)
      } else {
        Sentry.setUser(null)
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Profile fetch + Google sync (eski fetchProfile'in API tabanli versiyonu).
   * Sync endpoint Google metadata'yi server-side okur ve gerekirse update eder;
   * sonra guncel profili doner. Sync endpoint hata verirse GET'e dusup
   * mevcut profili gosterir.
   */
  async function fetchProfileWithSync(authUser: { id: string; email?: string }) {
    // 1) Analytics event'leri (eski fetchProfile davranisi)
    try {
      const signupKey = `signup_tracked_${authUser.id}`
      if (!localStorage.getItem(signupKey)) {
        // Profil bilgisi alindiktan sonra signup-eventini kontrol etmek icin
        // once profili cek (created_at kontrolu icin)
        const initialData = await fetchProfileFromApi()
        if (initialData?.profile?.created_at) {
          const createdMs = new Date(initialData.profile.created_at).getTime()
          const ageMs = Date.now() - createdMs
          if (ageMs < 2 * 60 * 1000) {
            const { data: { user: u } } = await supabase.auth.getUser()
            const provider = u?.app_metadata?.provider === 'email'
              ? 'magic_link'
              : (u?.app_metadata?.provider ?? 'google')
            trackEvent('Signup', { props: { provider } })
            resetGuestQuizCount()
          }
          localStorage.setItem(signupKey, '1')
        }
      }

      // Day2Return event — son goruldugu gun != bugun ise
      const today = new Date().toISOString().split('T')[0]
      const lastSeenKey = `last_seen_${authUser.id}`
      const lastSeen = localStorage.getItem(lastSeenKey)
      if (lastSeen && lastSeen !== today) {
        trackEvent('Day2Return', { props: { daysSinceLast: daysBetween(lastSeen, today) } })
      }
      localStorage.setItem(lastSeenKey, today)
    } catch {
      // localStorage yoksa sessizce atla (Safari private mode vb.)
    }

    // 2) Sync endpoint (Google metadata + profile + roles tek istek)
    const syncData = await syncProfileFromApi()
    if (syncData) {
      setProfile(applyRole(syncData.profile, syncData.isAdmin))
      return
    }

    // 3) Sync basarisiz olduysa GET'e dus
    const getData = await fetchProfileFromApi()
    if (getData) {
      setProfile(applyRole(getData.profile, getData.isAdmin))
    }
  }

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  /**
   * Magic link ile giris (passwordless). Kullanici yoksa olusturulur (shouldCreateUser=true).
   * Basarili olursa Supabase email ile giris linki gonderir. UI sonuca gore state guncellemeli.
   *
   * Donus:
   *   { ok: true }                  -> email kuyruga girdi, kullaniciya "kutunu kontrol et" goster
   *   { ok: false, error: string }  -> Supabase hatasi (rate limit, invalid email, SMTP sorunu)
   */
  async function signInWithMagicLink(
    email: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          shouldCreateUser: true,
        },
      })
      if (error) {
        return { ok: false, error: error.message }
      }
      return { ok: true }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Bilinmeyen hata',
      }
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    useAuthStore.getState().signOut()
  }

  return { user, profile, loading, signInWithGoogle, signInWithMagicLink, signOut }
}

/** YYYY-MM-DD stringleri arasi gun farki (analytics icin) */
function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(fromISO).getTime()
  const to = new Date(toISO).getTime()
  return Math.max(1, Math.round((to - from) / (1000 * 60 * 60 * 24)))
}
