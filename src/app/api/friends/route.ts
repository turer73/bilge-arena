import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { friendRequestSchema, friendActionSchema } from '@/lib/validations/schemas'

const friendLimiter = createRateLimiter('friends-mutate', 10, 60_000)

/**
 * GET /api/friends — Arkadas listesi + bekleyen istekler
 * POST /api/friends — Arkadas istegi gonder
 * PATCH /api/friends — Istegi kabul et
 * DELETE /api/friends — Arkadasligi sil / istegi reddet
 */

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  // Kabul edilmis arkadaslar
  const { data: friends } = await supabase
    .from('friendships')
    .select(`
      id, status, created_at, user_id, friend_id,
      friend:profiles!friendships_friend_id_fkey(id, username, display_name, avatar_url, total_xp, current_streak),
      sender:profiles!friendships_user_id_fkey(id, username, display_name, avatar_url, total_xp, current_streak)
    `)
    .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
    .in('status', ['accepted', 'pending'])

  // Arkadaslari duzenluyoruz: karsi tarafi dondur
  const list = (friends || []).map((f) => {
    const isMyRequest = f.user_id === user.id
    const friendProfile = isMyRequest ? f.friend : f.sender
    return {
      friendshipId: f.id,
      status: f.status,
      isSentByMe: isMyRequest,
      profile: friendProfile,
      createdAt: f.created_at,
    }
  })

  const accepted = list.filter((f) => f.status === 'accepted')
  const pendingReceived = list.filter((f) => f.status === 'pending' && !f.isSentByMe)
  const pendingSent = list.filter((f) => f.status === 'pending' && f.isSentByMe)

  return NextResponse.json({ friends: accepted, pendingReceived, pendingSent })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const rl = await friendLimiter.check(user.id)
  if (!rl.success) return NextResponse.json({ error: 'Cok hizli istek' }, { status: 429 })

  const parsed = friendRequestSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Gecersiz veri' }, { status: 400 })
  const { friendId } = parsed.data
  if (friendId === user.id) {
    return NextResponse.json({ error: 'Kendinize istek gonderemezsiniz' }, { status: 400 })
  }

  // Mevcut iliskileri kontrol et
  const { data: existing } = await supabase
    .from('friendships')
    .select('id, status')
    .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`)
    .limit(1)
    .single()

  if (existing) {
    if (existing.status === 'accepted') {
      return NextResponse.json({ error: 'Zaten arkadassiniz' }, { status: 409 })
    }
    if (existing.status === 'pending') {
      return NextResponse.json({ error: 'Zaten bekleyen bir istek var' }, { status: 409 })
    }
  }

  const { error } = await supabase
    .from('friendships')
    .insert({ user_id: user.id, friend_id: friendId, status: 'pending' })

  if (error) {
    console.error('[Friends API] Insert hatasi:', error)
    return NextResponse.json({ error: 'Istek gonderilemedi' }, { status: 500 })
  }

  return NextResponse.json({ status: 'sent' })
}

export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const rl = await friendLimiter.check(user.id)
  if (!rl.success) return NextResponse.json({ error: 'Cok hizli istek' }, { status: 429 })

  const parsed = friendActionSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Gecersiz veri' }, { status: 400 })
  const { friendshipId } = parsed.data

  // Sadece alici kabul edebilir
  const { data, error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId)
    .eq('friend_id', user.id)
    .eq('status', 'pending')
    .select()
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Istek bulunamadi veya yetkiniz yok' }, { status: 404 })
  }

  return NextResponse.json({ status: 'accepted' })
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const rl = await friendLimiter.check(user.id)
  if (!rl.success) return NextResponse.json({ error: 'Cok hizli istek' }, { status: 429 })

  const parsed = friendActionSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Gecersiz veri' }, { status: 400 })
  const { friendshipId } = parsed.data

  // Her iki taraf da silebilir
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId)
    .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)

  if (error) {
    return NextResponse.json({ error: 'Silme basarisiz' }, { status: 500 })
  }

  return NextResponse.json({ status: 'removed' })
}
