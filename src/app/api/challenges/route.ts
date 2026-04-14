import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { GAME_SLUGS } from '@/lib/constants/games'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { challengeCreateSchema } from '@/lib/validations/schemas'

const challengeLimiter = createRateLimiter('challenge-create', 5, 60_000)

/**
 * GET /api/challenges — Kullanicinin duelloslarini getir
 * POST /api/challenges — Yeni duello olustur
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const svc = createServiceRoleClient()

  const { data, error } = await svc
    .from('challenges')
    .select(`
      *,
      challenger:challenger_id(id, display_name, username, avatar_url),
      opponent:opponent_id(id, display_name, username, avatar_url)
    `)
    .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ challenges: data })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const rl = await challengeLimiter.check(user.id)
  if (!rl.success) return NextResponse.json({ error: 'Cok hizli istek' }, { status: 429 })

  const body = await req.json()
  const parsed = challengeCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'opponentId ve game gerekli' }, { status: 400 })
  }
  const { opponentId, game, category } = parsed.data

  if (!(GAME_SLUGS as readonly string[]).includes(game)) {
    return NextResponse.json({ error: 'Gecersiz oyun secimi' }, { status: 400 })
  }

  if (opponentId === user.id) {
    return NextResponse.json({ error: 'Kendinize meydan okuyamazsiniz' }, { status: 400 })
  }

  const svc = createServiceRoleClient()

  // Arkadaslik kontrolu
  const { data: friendship } = await svc
    .from('friendships')
    .select('id')
    .or(`and(user_id.eq.${user.id},friend_id.eq.${opponentId}),and(user_id.eq.${opponentId},friend_id.eq.${user.id})`)
    .eq('status', 'accepted')
    .limit(1)

  if (!friendship || friendship.length === 0) {
    return NextResponse.json({ error: 'Sadece arkadaslariniza meydan okuyabilirsiniz' }, { status: 400 })
  }

  // 10 rastgele soru sec
  let query = svc
    .from('questions')
    .select('id')
    .eq('game', game)
    .eq('is_active', true)

  if (category) query = query.eq('category', category)

  const { data: allQuestions } = await query.limit(100)

  if (!allQuestions || allQuestions.length < 5) {
    return NextResponse.json({ error: 'Yeterli soru bulunamadi' }, { status: 400 })
  }

  // Rastgele 10 sec
  const shuffled = [...allQuestions].sort(() => Math.random() - 0.5)
  const questionIds = shuffled.slice(0, Math.min(10, shuffled.length)).map(q => q.id)

  // Duello olustur
  const { data: challenge, error } = await svc
    .from('challenges')
    .insert({
      challenger_id: user.id,
      opponent_id: opponentId,
      game,
      category: category || null,
      question_ids: questionIds,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[Challenges] Insert hatasi:', error)
    return NextResponse.json({ error: 'Duello olusturulamadi' }, { status: 500 })
  }

  return NextResponse.json({ challengeId: challenge.id })
}
