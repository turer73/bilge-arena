import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database.client'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  ACTIVATION_REWARD_COOKIE,
  claimActivationReward,
} from '@/lib/activation/server-reward'
import { safeAuthNext } from '@/lib/auth/safe-next'
import {
  hasCurrentLegalConsent,
  legalConsentIntentMatchesCookie,
  LEGAL_CONSENT_INTENT_COOKIE,
  recordLegalConsentIntent,
} from '@/lib/legal-consent/server'
import { getClientIp } from '@/lib/utils/client-ip'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

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
      SUPABASE_URL,
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
      const redirectUrl = candidateUrl.origin === origin ? candidateUrl : new URL('/arena', origin)
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
