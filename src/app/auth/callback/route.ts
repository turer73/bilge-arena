import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database.client'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  ACTIVATION_REWARD_COOKIE,
  claimActivationReward,
} from '@/lib/activation/server-reward'
import {
  INSTITUTION_NO_ACCESS_PATH,
  isInstitutionSurfacePath,
  safeAuthNext,
} from '@/lib/auth/safe-next'
import { INSTITUTION_PILOT_ENTRY_PERMISSION } from '@/lib/admin/platform-permissions'
import { userHasAnyPlatformPermission } from '@/lib/supabase/platform-access'
import {
  hasCurrentLegalConsent,
  legalConsentIntentMatchesCookie,
  LEGAL_CONSENT_INTENT_COOKIE,
  recordLegalConsentIntent,
} from '@/lib/legal-consent/server'
import { getClientIp } from '@/lib/utils/client-ip'
import { resolveAcademyServerSupabaseOrigin } from '@/lib/auth/isolated-test'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const SUPABASE_SERVER_URL = resolveAcademyServerSupabaseOrigin(SUPABASE_URL)
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || 'placeholder-anon-key'

function clearLegalConsentIntentCookie(response: NextResponse) {
  // Cookie path must match the path used by /api/consent/intent. A bare
  // `delete(name)` emits Path=/ and leaves the /auth/callback cookie alive.
  response.cookies.set(LEGAL_CONSENT_INTENT_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/auth/callback',
    maxAge: 0,
    expires: new Date(0),
  })
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const legalConsentToken = searchParams.get('legalConsent')
  // Open redirect önleme: yalnız güvenli relative path kabul edilir.
  const next = safeAuthNext(searchParams.get('next'))

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient<Database>(
      SUPABASE_SERVER_URL,
      SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      }
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.session?.user) {
      const admin = createServiceRoleClient()
      // A deleted profile must not be resurrected by a fresh OAuth exchange.
      // Check before legal-consent/reward work and globally revoke the newly
      // issued session when the profile is tombstoned or unexpectedly absent.
      const { data: accountProfile, error: accountProfileError } = await admin
        .from('profiles')
        .select('deleted_at')
        .eq('id', data.session.user.id)
        .maybeSingle()
      if (accountProfileError || !accountProfile || accountProfile.deleted_at != null) {
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' })
        if (signOutError) {
          console.error('[AuthCallback] pasif hesap oturumu global kapatılamadı:', signOutError.message)
        }
        const denied = NextResponse.redirect(
          `${origin}/giris?${accountProfileError || !accountProfile ? 'error=account_unavailable' : 'deleted=1'}`,
        )
        denied.headers.set('Cache-Control', 'private, no-store')
        clearLegalConsentIntentCookie(denied)
        for (const cookie of cookieStore.getAll()) {
          if (
            /^sb-.*-auth-token(?:\.\d+)?$/.test(cookie.name)
            || cookie.name.includes('code-verifier')
          ) {
            denied.cookies.delete(cookie.name)
          }
        }
        return denied
      }
      let legalConsentReady = false
      try {
        legalConsentReady = legalConsentToken
          ? legalConsentIntentMatchesCookie(
              legalConsentToken,
              cookieStore.get(LEGAL_CONSENT_INTENT_COOKIE)?.value,
            ) && await recordLegalConsentIntent(admin, {
              userId: data.session.user.id,
              rawToken: legalConsentToken,
              ipAddress: (() => {
                const ip = getClientIp(request.headers)
                return ip === 'unknown' ? null : ip
              })(),
              userAgent: request.headers.get('user-agent'),
            })
          : await hasCurrentLegalConsent(admin, data.session.user.id)
      } catch (consentError) {
        console.error(
          '[AuthCallback] hukuki kabul kaydı doğrulanamadı:',
          (consentError as Error).message,
        )
      }

      if (!legalConsentReady) {
        // Exchange already created a session cookie. Clear it before returning
        // so a missing/forged evidence token can never become an authenticated
        // account by navigating away from the error page.
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' })
        if (signOutError) {
          console.error('[AuthCallback] kabul hatası sonrası oturum kapatılamadı')
        }
        const denied = NextResponse.redirect(`${origin}/giris?error=consent_required`)
        clearLegalConsentIntentCookie(denied)
        for (const cookie of cookieStore.getAll()) {
          if (
            /^sb-.*-auth-token(?:\.\d+)?$/.test(cookie.name)
            || cookie.name.includes('code-verifier')
          ) {
            denied.cookies.delete(cookie.name)
          }
        }
        return denied
      }

      const candidateUrl = new URL(next, origin)
      let redirectUrl = candidateUrl.origin === origin ? candidateUrl : new URL('/arena', origin)

      // Kurum girisi: hedef /arena/kurum ise ve hesapta kurum yetkisi yoksa
      // kullaniciyi once TOTP kurulumuna (proxy AAL2 kapisi) zorlamak yerine
      // aciklama sayfasina gonder. Bu yetki bakisi yalniz OAuth degisimini AZ
      // ONCE tamamlamis kisi icin yapilir; proxy'deki "AAL2'den once yetki
      // sorgusu yok" kurali calinan cookie senaryosunu korur ve degismez.
      // Sorgu basarisiz olursa fail-closed: aciklama sayfasi. Oradaki "Kurum
      // paneline git" baglantisi gercek yetkili icin normal TOTP'li yolu acar.
      if (isInstitutionSurfacePath(redirectUrl.pathname)) {
        let hasInstitutionAccess = false
        try {
          hasInstitutionAccess = await userHasAnyPlatformPermission(
            admin,
            data.session.user.id,
            [INSTITUTION_PILOT_ENTRY_PERMISSION],
          )
        } catch (permissionError) {
          console.error('[AuthCallback] kurum yetkisi sorgulanamadı:', (permissionError as Error).message)
        }
        if (!hasInstitutionAccess) redirectUrl = new URL(INSTITUTION_NO_ACCESS_PATH, origin)
      }
      const rewardToken = cookieStore.get(ACTIVATION_REWARD_COOKIE)?.value
      let rewardResolved = false
      if (rewardToken) {
        try {
          const reward = await claimActivationReward(
            admin,
            data.session.user.id,
            rewardToken,
          )
          rewardResolved = reward !== null
          if (reward && !reward.alreadyProcessed && reward.xpAwarded > 0) {
            redirectUrl.searchParams.set('activationXp', String(reward.xpAwarded))
          }
        } catch (rewardError) {
          console.error('[AuthCallback] aktivasyon ödülü uygulanamadı:', (rewardError as Error).message)
        }
      }

      const response = NextResponse.redirect(redirectUrl)
      clearLegalConsentIntentCookie(response)
      if (rewardResolved) response.cookies.delete(ACTIVATION_REWARD_COOKIE)
      return response
    }
  }

  // Auth hatasi — ana sayfaya yonlendir
  return NextResponse.redirect(`${origin}/?error=auth`)
}
