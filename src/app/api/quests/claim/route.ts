import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { questClaimSchema } from '@/lib/validations/schemas'
import { z } from 'zod'

const claimLimiter = createRateLimiter('quest-claim', 10, 60_000)
const claimResultSchema = z.object({
  xpEarned: z.number().int().nonnegative(),
  coinsEarned: z.number().int().nonnegative(),
  alreadyProcessed: z.boolean(),
})

// POST: Tamamlanan görevin XP ödülünü al
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await claimLimiter.check(user.id)
  if (!rl.success) return NextResponse.json({ error: 'Çok hızlı istek' }, { status: 429 })

  const body = await request.json()
  const parsed = questClaimSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'questId gerekli' }, { status: 400 })
  }
  const { questId } = parsed.data

  const svc = createServiceRoleClient()

  // Migration 093: claim flag, XP, coin ve iki reward-ledger satiri tek
  // transaction'da. Route'un profil fallback'i yoktur; RPC hata verirse hicbir
  // parca uygulanmaz. Replay ayni sonucu doner ve yeniden odul uretmez.
  const { data, error } = await svc.rpc('claim_daily_quest_reward', {
    p_user_id: user.id,
    p_user_quest_id: questId,
  })
  if (error) {
    const status = error.code === 'P0002' ? 404
      : error.code === '42501' ? 403
        : error.code === '22023' ? 400
          : 500
    console.error('[QuestClaim] atomic RPC hatasi:', error.code)
    return NextResponse.json({ error: 'Görev ödülü alınamadı' }, { status })
  }
  const result = claimResultSchema.safeParse(data)
  if (!result.success) {
    console.error('[QuestClaim] atomic RPC geçersiz sonuç')
    return NextResponse.json({ error: 'Görev ödülü alınamadı' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    xp_earned: result.data.xpEarned,
    coins_earned: result.data.coinsEarned,
    already_processed: result.data.alreadyProcessed,
  })
}
