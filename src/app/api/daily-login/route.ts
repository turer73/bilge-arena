import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'

const loginLimiter = createRateLimiter('daily-login', 5, 60_000)

const MAX_XP = 70

const claimResultSchema = z.object({
  status: z.enum(['claimed', 'streak_reset', 'already_claimed']),
  streak: z.number().int().nonnegative(),
  xpAwarded: z.number().int().nonnegative(),
  coinsAwarded: z.number().int().nonnegative(),
})

/**
 * Günlük giriş ödülü API'si.
 *
 * Her gün (Europe/Istanbul) ilk girişte artan XP verir:
 *   Gün 1: 10 XP, Gün 2: 20 XP ... Gün 7+: 70 XP (max)
 *
 * Seri, ödül ve "bugün alındı mı" kararı tek bir RPC'de, profil satırı
 * kilitliyken verilir (claim_daily_login, migration 20261017100100). Önceden
 * route profili oku-değiştir-yaz ile güncelliyor, longest_streak'e
 * dokunmuyordu; oturum tetikleyicisi ise seriyi UTC gününe göre yazıyordu
 * (derin inceleme 2026-10-15 §4.2).
 *
 * Dönüş:
 *   - already_claimed: Bugün zaten giriş ödülü alınmış
 *   - claimed: XP verildi
 *   - streak_reset: Seri kırıldı, 1'den başladı
 */
export async function POST() {
  const cookieClient = await createClient()

  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const rl = await loginLimiter.check(user.id)
  if (!rl.success) return NextResponse.json({ error: 'Cok hizli istek' }, { status: 429 })

  const svc = createServiceRoleClient()
  // claim_daily_login üretilmiş tiplerde henüz yok (tip senkronu ayrı iş, #2451);
  // sonuç aşağıda zod ile doğrulanır.
  const { data, error } = await svc.rpc('claim_daily_login' as never, { p_user_id: user.id } as never)
  if (error) {
    if (error.code === 'P0002') {
      return NextResponse.json({ error: 'profile_not_found' }, { status: 404 })
    }
    console.error('[DailyLogin] claim_daily_login hatası:', error.code)
    // PGRST202: migration henüz uygulanmamış. Ödül bugün verilemez, istemci
    // sessizce geçer; tekrar denenebilir.
    return NextResponse.json(
      { error: 'daily_login_unavailable' },
      { status: error.code === 'PGRST202' ? 503 : 500 },
    )
  }

  const result = claimResultSchema.safeParse(data)
  if (!result.success) {
    console.error('[DailyLogin] claim_daily_login beklenmeyen yanıt')
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }

  return NextResponse.json({ ...result.data, maxXP: MAX_XP })
}
