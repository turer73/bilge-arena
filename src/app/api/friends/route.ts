import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
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
  const admin = createServiceRoleClient()

  // Iliskiyi ve profil kartini ayri sorgula. Migration 177'den sonra browser
  // rolu profiles okuyamaz; service role ham veriyi yalniz burada alir ve
  // asagida iliski + profil hedef kitlesine gore whitelist eder.
  const { data: relationships, error: friendsError } = await admin
    .from('friendships')
    .select('id, status, created_at, user_id, friend_id')
    .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
    .in('status', ['accepted', 'pending'])

  // Engellediklerim (yalniz benim engelledigim; karsi tarafin engeli bana gosterilmez)
  const { data: blockedRows, error: blockedError } = await admin
    .from('friendships')
    .select('id, created_at, friend_id')
    .eq('user_id', user.id)
    .eq('status', 'blocked')

  if (friendsError || blockedError) {
    console.error('[Friends API] Listeleme hatasi:', friendsError?.code || blockedError?.code)
    return NextResponse.json({ error: 'Arkadaslar yuklenemedi' }, { status: 500 })
  }

  const profileIds = Array.from(new Set([
    ...(relationships || []).map((item) => item.user_id === user.id ? item.friend_id : item.user_id),
    ...(blockedRows || []).map((item) => item.friend_id),
  ]))

  type FriendProfileRow = {
    id: string
    username: string
    avatar_url: string | null
    total_xp: number | null
    current_streak: number | null
    profile_visibility: 'private' | 'friends' | 'public'
  }

  let profileRows: FriendProfileRow[] = []
  if (profileIds.length > 0) {
    const current = await admin
      .from('profiles')
      .select('id, username, avatar_url, total_xp, current_streak, profile_visibility')
      .in('id', profileIds)

    if (current.error) {
      // App-first rollout: migration 185 gelmeden yeni kolon secimi kirilir.
      // Eski semada yalniz kimlik karti doner; XP/seri fail-closed maskelenir.
      const legacy = await admin
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', profileIds)
      if (legacy.error) {
        console.error('[Friends API] Profil karti hatasi:', legacy.error.code)
        return NextResponse.json({ error: 'Arkadaslar yuklenemedi' }, { status: 500 })
      }
      profileRows = (legacy.data || []).map((item) => ({
        ...item,
        total_xp: 0,
        current_streak: 0,
        profile_visibility: 'private' as const,
      }))
    } else {
      profileRows = (current.data || []) as FriendProfileRow[]
    }
  }

  const profilesById = new Map(profileRows.map((profile) => [profile.id, profile]))
  const projectProfile = (profileId: string, accepted: boolean) => {
    const profile = profilesById.get(profileId)
    const canSeeStats = accepted && profile?.profile_visibility !== 'private'
    return {
      id: profileId,
      username: profile?.username ?? null,
      display_name: null,
      avatar_url: profile?.avatar_url ?? null,
      total_xp: canSeeStats ? profile?.total_xp ?? 0 : 0,
      current_streak: canSeeStats ? profile?.current_streak ?? 0 : 0,
    }
  }

  const list = (relationships || []).map((relationship) => {
    const isSentByMe = relationship.user_id === user.id
    const profileId = isSentByMe ? relationship.friend_id : relationship.user_id
    return {
      friendshipId: relationship.id,
      status: relationship.status,
      isSentByMe,
      profile: projectProfile(profileId, relationship.status === 'accepted'),
      createdAt: relationship.created_at,
    }
  })

  const accepted = list.filter((item) => item.status === 'accepted')
  const pendingReceived = list.filter((item) => item.status === 'pending' && !item.isSentByMe)
  const pendingSent = list.filter((item) => item.status === 'pending' && item.isSentByMe)
  const blocked = (blockedRows || []).map((b) => ({
    friendshipId: b.id,
    profile: projectProfile(b.friend_id, false),
    createdAt: b.created_at,
  }))

  return NextResponse.json({ friends: accepted, pendingReceived, pendingSent, blocked })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  const admin = createServiceRoleClient()

  const rl = await friendLimiter.check(user.id)
  if (!rl.success) return NextResponse.json({ error: 'Cok hizli istek' }, { status: 429 })

  const parsed = friendRequestSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Gecersiz veri' }, { status: 400 })
  const { friendId } = parsed.data
  if (friendId === user.id) {
    return NextResponse.json({ error: 'Kendinize istek gonderemezsiniz' }, { status: 400 })
  }

  let { data: result, error } = await admin.rpc('request_friendship', {
    p_requester: user.id,
    p_target: friendId,
  })

  // App-first rollout compatibility: migration 186'dan once yeni RPC yoktur.
  // Yalniz function-missing durumunda eski server-side yolunu kullan; migration
  // sonrasi her istek advisory-lock'li atomik RPC'den gecer.
  if (error && ['PGRST202', '42883'].includes(error.code || '')) {
    const existing = await admin
      .from('friendships')
      .select('id, status')
      .or(`and(user_id.eq.${user.id},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${user.id})`)
      .limit(1)
      .maybeSingle()

    if (existing.error) {
      error = existing.error
    } else if (existing.data?.status) {
      result = existing.data.status
      error = null
    } else {
      const inserted = await admin
        .from('friendships')
        .insert({ user_id: user.id, friend_id: friendId, status: 'pending' })
      error = inserted.error
      result = inserted.error ? null : 'sent'
    }
  }

  if (error) {
    console.error('[Friends API] request_friendship hatasi:', error.code)
    return NextResponse.json({ error: 'Istek gonderilemedi' }, { status: 500 })
  }

  if (result === 'invalid') return NextResponse.json({ error: 'Gecersiz istek' }, { status: 400 })
  if (result === 'not_found') return NextResponse.json({ error: 'Kullanici bulunamadi' }, { status: 404 })
  if (result === 'blocked') return NextResponse.json({ error: 'Bu kullaniciya istek gonderilemez' }, { status: 403 })
  if (result === 'accepted') return NextResponse.json({ error: 'Zaten arkadassiniz' }, { status: 409 })
  if (result === 'pending') return NextResponse.json({ error: 'Zaten bekleyen bir istek var' }, { status: 409 })
  if (result !== 'sent') return NextResponse.json({ error: 'Istek gonderilemedi' }, { status: 500 })

  return NextResponse.json({ status: 'sent' })
}

export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })
  const admin = createServiceRoleClient()

  const rl = await friendLimiter.check(user.id)
  if (!rl.success) return NextResponse.json({ error: 'Cok hizli istek' }, { status: 429 })

  const parsed = friendActionSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Gecersiz veri' }, { status: 400 })
  const { friendshipId } = parsed.data

  // Sadece alici kabul edebilir
  const { data, error } = await admin
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
  const admin = createServiceRoleClient()

  const rl = await friendLimiter.check(user.id)
  if (!rl.success) return NextResponse.json({ error: 'Cok hizli istek' }, { status: 429 })

  const parsed = friendActionSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Gecersiz veri' }, { status: 400 })
  const { friendshipId } = parsed.data

  // Her iki taraf da silebilir
  const { data, error } = await admin
    .from('friendships')
    .delete()
    .eq('id', friendshipId)
    .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`)
    .select('id')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: 'Silme basarisiz' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Arkadaslik bulunamadi veya yetkiniz yok' }, { status: 404 })
  }

  return NextResponse.json({ status: 'removed' })
}
