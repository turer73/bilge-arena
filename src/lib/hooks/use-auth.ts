'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useAuthStore } from '@/stores/auth-store'
import { trackEvent } from '@/lib/utils/plausible'
import { resetGuestQuizCount } from '@/lib/hooks/use-guest-session'
import type { Profile } from '@/types/database'
import { safeAuthNext } from '@/lib/auth/safe-next'
import { trDayString, trYesterdayString } from '@/lib/utils/tr-date'

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
 * isAdmin yalnız gerçek platform yönetim izinlerini temsil eder; kurum pilotu
 * veya öğretmen pilotu erişimi bu alanı yükseltmez.
 * role alani UI'da kullanildigi icin 'admin' | 'user' string'ine map ediliyor.
 */
function applyRole(profile: Profile, isAdmin: boolean): Profile {
  return {
    ...profile,
    role: isAdmin ? 'admin' : (profile.role || 'user'),
  } as Profile
}

const SIGNUP_WINDOW_MS = 2 * 60 * 1000

/**
 * Kayit ani = hesabin ilk dogrulandigi an.
 * Magic link'te auth.users satiri (ve handle_new_user ile profil) e-posta
 * ISTENDIGI anda olusur; email_confirmed_at ise linke tiklaninca dolar
 * (canli projede mailer_autoconfirm=false). Google'da ikisi ayni andir.
 * created_at'e bakmak, linke 2 dk'dan gec tiklayanlari hic saymiyordu.
 */
function signupDate(authUser: User): Date | null {
  const confirmedAt = authUser.email_confirmed_at ?? authUser.confirmed_at ?? authUser.created_at
  if (!confirmedAt) return null
  const date = new Date(confirmedAt)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Hesap az once mi acildi? */
function isFreshSignup(authUser: User): boolean {
  const signedUpAt = signupDate(authUser)
  return signedUpAt !== null && Date.now() - signedUpAt.getTime() < SIGNUP_WINDOW_MS
}

/**
 * Bugun, kayit gununu izleyen TR takvim gunu mu? (D1 donusu)
 * Gun siniri streak/daily-login ile ayni: Europe/Istanbul (tr-date).
 */
function isDayAfterSignup(authUser: User): boolean {
  const signedUpAt = signupDate(authUser)
  return signedUpAt !== null && trDayString(signedUpAt) === trYesterdayString()
}

/**
 * Profil verisini API'den yeniden ceker ve auth-store'u gunceller.
 * Hook disinda da cagirilabilir (ornegin session save sonrasi).
 * DB trigger'lari XP/level/streak guncelledikten sonra cagrilmali.
 */
export async function refreshProfile(canApply?: () => boolean): Promise<void> {
  if (canApply && !canApply()) return
  const data = await fetchProfileFromApi()
  // A session saver can leave its account/attempt while this request is in
  // flight. Check before writing the global store, not only after returning.
  if (!data || (canApply && !canApply())) return
  useAuthStore.getState().setProfile(applyRole(data.profile, data.isAdmin))
}

/** Cevap geldiginde oturum hala bu kullanicida mi? (cikis / hesap degisimi) */
function isCurrentUser(userId: string): boolean {
  return useAuthStore.getState().user?.id === userId
}

/**
 * Profile fetch + Google sync (eski fetchProfile'in API tabanli versiyonu).
 * Sync endpoint Google metadata'yi server-side okur ve gerekirse update eder;
 * sonra guncel profili doner. Sync endpoint hata verirse GET'e dusup
 * mevcut profili gosterir.
 */
async function loadProfile(userId: string): Promise<void> {
  // Google metadata sync OTURUM BASINA 1 kez yeter: sessionStorage guard ile
  // ilk basarili sync'ten sonra duz GET'e (/api/profile, 60/dk) dusulur.
  const syncKey = `profile_synced_${userId}`
  let alreadySynced = false
  try { alreadySynced = sessionStorage.getItem(syncKey) === '1' } catch {}

  if (!alreadySynced) {
    const syncData = await syncProfileFromApi()
    if (syncData) {
      try { sessionStorage.setItem(syncKey, '1') } catch {}
      if (isCurrentUser(userId)) {
        useAuthStore.getState().setProfile(applyRole(syncData.profile, syncData.isAdmin))
      }
      return
    }
    // Sync basarisiz (429 dahil) → flag SET ETME (sonraki firsatta tekrar dene),
    // asagidaki GET ile profili yine de goster.
  }

  // Zaten sync edildi VEYA sync basarisiz → duz GET (genis limit)
  const getData = await fetchProfileFromApi()
  // Istek ucarken cikis yapildiysa eski hesabin profili store'a geri yazilmasin.
  if (getData && isCurrentUser(userId)) {
    useAuthStore.getState().setProfile(applyRole(getData.profile, getData.isAdmin))
  }
}

/**
 * Kullanici basina ucustaki profil yuklemesi (single-flight).
 *
 * useAuth her tuketici bilesende (navbar, landing mini quiz, giris, kayit
 * modali) ayri calisir; her ornek hem getUser hem INITIAL_SESSION ile yukler,
 * Supabase sekme odaginda SIGNED_IN'i de yeniden yayinlar. sync guard'i
 * cevaptan SONRA yazildigi icin bu cagrilarin hepsi /api/profile/sync'e
 * (kullanici basina 5/dk) gidiyor, fazlasi 429 alip GET'e dusuyordu; 429'un
 * GET'i basarili sync'ten eski profili sonradan yazabiliyordu. Ayni kullanici
 * icin es zamanli cagrilar artik tek yuklemeyi paylasir; bittiginde kayit
 * silinir, sonraki olaylar (TOKEN_REFRESHED vb.) yeni yukleme baslatir.
 */
const profileLoads = new Map<string, Promise<void>>()

function loadProfileOnce(userId: string): Promise<void> {
  const inflight = profileLoads.get(userId)
  if (inflight) return inflight
  const load = loadProfile(userId).finally(() => {
    profileLoads.delete(userId)
  })
  profileLoads.set(userId, load)
  return load
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
   * Oturum acik kullanici icin auth analytics'i (Signup/Day2Return) gonderir
   * ve profili yukler (bkz. loadProfileOnce).
   */
  async function fetchProfileWithSync(authUser: User) {
    // 1) Analytics event'leri (eski fetchProfile davranisi)
    try {
      const signupKey = `signup_tracked_${authUser.id}`
      if (!localStorage.getItem(signupKey)) {
        // Kontrol+yazma senkron kalmali, araya await girmemeli. Bu fonksiyon
        // ayni yuklemede birden cok kez es zamanli kosar (getUser +
        // INITIAL_SESSION, ustelik useAuth'u kullanan her bilesen icin ayri);
        // flag eskiden /api/profile cevabindan sonra yaziliyordu, hepsi bos
        // flag gorup Signup'i tekrar gonderiyordu (Plausible toplam/tekil ~2,1).
        // Kayit tespiti auth kullanicisindan yapildigi icin ek istek de yok.
        localStorage.setItem(signupKey, '1')
        if (isFreshSignup(authUser)) {
          const provider = authUser.app_metadata?.provider === 'email'
            ? 'magic_link'
            : (authUser.app_metadata?.provider ?? 'google')
          trackEvent('Signup', { props: { provider } })
          resetGuestQuizCount()
        }
      }

      // Day2Return: kayit gununu izleyen TR gununde ilk gorulme, hesap basina
      // (cihaz basina) bir kez. Eskiden "bu cihazda son gorulen gunden farkli
      // herhangi bir gun" sayiliyordu; eski kullanicilarin her donusu de
      // giriyordu. Flag, Signup'taki gibi await'siz yazilir.
      const day2Key = `day2_return_tracked_${authUser.id}`
      if (!localStorage.getItem(day2Key) && isDayAfterSignup(authUser)) {
        localStorage.setItem(day2Key, '1')
        trackEvent('Day2Return')
      }
    } catch {
      // localStorage yoksa sessizce atla (Safari private mode vb.)
    }

    // 2) Profil: ayni kullanici icin es zamanli cagrilar tek yuklemeyi paylasir
    await loadProfileOnce(authUser.id)
  }

  async function signInWithGoogle(
    next = '/arena',
    options?: {
      forceAccountSelection?: boolean
      legalConsentToken?: string
    },
  ) {
    const safeNext = safeAuthNext(next)
    const callbackUrl = new URL('/auth/callback', window.location.origin)
    callbackUrl.searchParams.set('next', safeNext)
    if (options?.legalConsentToken) {
      callbackUrl.searchParams.set('legalConsent', options.legalConsentToken)
    }
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl.toString(),
        queryParams: options?.forceAccountSelection
          ? { prompt: 'select_account' }
          : undefined,
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
    next = '/arena',
    options?: { legalConsentToken?: string },
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      const callbackUrl = new URL('/auth/callback', window.location.origin)
      callbackUrl.searchParams.set('next', safeAuthNext(next))
      if (options?.legalConsentToken) {
        callbackUrl.searchParams.set('legalConsent', options.legalConsentToken)
      }
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: callbackUrl.toString(),
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
