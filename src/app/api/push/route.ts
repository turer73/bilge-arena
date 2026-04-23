import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { pushSubscribeSchema, pushUnsubscribeSchema } from '@/lib/validations/schemas'

const pushLimiter = createRateLimiter('push-subscribe', 5, 60_000)

/**
 * POST /api/push — Push bildirim aboneligi kaydet
 * DELETE /api/push — Aboneligi kaldir
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const rl = await pushLimiter.check(user.id)
  if (!rl.success) return NextResponse.json({ error: 'Çok hızlı istek' }, { status: 429 })

  const body = await req.json()
  const parsed = pushSubscribeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Eksik alanlar' }, { status: 400 })
  }
  const { endpoint, p256dh, auth } = parsed.data

  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: user.id, endpoint, p256dh, auth },
      { onConflict: 'user_id,endpoint' },
    )

  if (error) {
    console.error('[Push API] Kayıt hatası:', error)
    return NextResponse.json({ error: 'Kayıt başarısız' }, { status: 500 })
  }

  return NextResponse.json({ status: 'subscribed' })
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const body = await req.json()
  const parsed = pushUnsubscribeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Endpoint gerekli' }, { status: 400 })
  }
  const { endpoint } = parsed.data

  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint)

  return NextResponse.json({ status: 'unsubscribed' })
}
