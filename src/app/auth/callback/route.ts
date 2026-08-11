import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database.client'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  ACTIVATION_REWARD_COOKIE,
  claimActivationReward,
} from '@/lib/activation/server-reward'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Open redirect onleme: sadece relative path kabul et, // ile baslayanları reddet
  const rawNext = searchParams.get('next') ?? '/arena'
  const next = rawNext.startsWith('/')
    && !rawNext.startsWith('//')
    && !rawNext.includes('\\')
    ? rawNext
    : '/arena'

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

    if (!error) {
      const candidateUrl = new URL(next, origin)
      const redirectUrl = candidateUrl.origin === origin ? candidateUrl : new URL('/arena', origin)
      const rewardToken = cookieStore.get(ACTIVATION_REWARD_COOKIE)?.value
      let rewardResolved = false
      if (data.session?.user && rewardToken) {
        try {
          const reward = await claimActivationReward(
            createServiceRoleClient(),
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
      if (rewardResolved) response.cookies.delete(ACTIVATION_REWARD_COOKIE)
      return response
    }
  }

  // Auth hatasi — ana sayfaya yonlendir
  return NextResponse.redirect(`${origin}/?error=auth`)
}
