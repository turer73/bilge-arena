import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { blockUserSchema } from '@/lib/validations/schemas'

const blockLimiter = createRateLimiter('friends-block', 10, 60_000)

/**
 * POST   /api/friends/block — Kullaniciyi engelle (atomik block_user RPC)
 * DELETE /api/friends/block — Engeli kaldir
 *
 * Engelleme friendships.status='blocked' kullanir. block_user RPC engelleyeni
 * auth.uid()'ten alir; eski iliskiyi siler, (me, target, 'blocked') ekler.
 */

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const rl = await blockLimiter.check(user.id)
  if (!rl.success) return NextResponse.json({ error: 'Cok hizli istek' }, { status: 429 })

  const parsed = blockUserSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Gecersiz veri' }, { status: 400 })
  const { targetId } = parsed.data
  if (targetId === user.id) {
    return NextResponse.json({ error: 'Kendinizi engelleyemezsiniz' }, { status: 400 })
  }

  const { error } = await supabase.rpc('block_user', { p_target: targetId })
  if (error) {
    // Ham PG hatasini sizdirma (bkz feedback: postgrest-error-leak)
    console.error('[Block API] block_user hatasi:', error.message)
    return NextResponse.json({ error: 'Engelleme basarisiz' }, { status: 500 })
  }

  return NextResponse.json({ status: 'blocked' })
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const rl = await blockLimiter.check(user.id)
  if (!rl.success) return NextResponse.json({ error: 'Cok hizli istek' }, { status: 429 })

  const parsed = blockUserSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Gecersiz veri' }, { status: 400 })
  const { targetId } = parsed.data

  // Sadece engelleyen (user_id=me) kendi engelini kaldirir
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('friendships')
    .delete()
    .eq('user_id', user.id)
    .eq('friend_id', targetId)
    .eq('status', 'blocked')
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[Block API] unblock hatasi:', error.message)
    return NextResponse.json({ error: 'Engel kaldirilamadi' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Engel bulunamadi' }, { status: 404 })
  }

  return NextResponse.json({ status: 'unblocked' })
}
