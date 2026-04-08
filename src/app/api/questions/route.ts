import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkAdmin } from '@/lib/supabase/admin'
import { NextResponse, type NextRequest } from 'next/server'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { GAME_SLUGS } from '@/lib/constants/games'

const questionsLimiter = createRateLimiter('questions', 120, 60_000) // 120 req/dk (50 öğrenci × ~2 req/dk)
const VALID_GAMES = new Set(GAME_SLUGS)

/** parseInt ile boundary kontrolu: min <= val <= max */
function safeInt(value: string | null, fallback: number, min: number, max: number): number {
  const n = parseInt(value ?? String(fallback))
  if (isNaN(n) || n < min) return fallback
  return Math.min(n, max)
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  // Auth'lu kullanıcılar rate limit'ten muaf (gerçek öğrenci, bot değil)
  // Auth'suz istekler IP bazlı rate limit'e tabi
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
    const rl = await questionsLimiter.check(ip)
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Cok fazla istek. Lutfen bekleyin.' },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
      )
    }
  }
  const { searchParams } = new URL(request.url)

  const game = searchParams.get('game')
  const category = searchParams.get('category')
  const difficulty = searchParams.get('difficulty')
  const active = searchParams.get('active')
  const search = searchParams.get('search')
  const page = safeInt(searchParams.get('page'), 1, 1, 1000)
  const limit = safeInt(searchParams.get('limit'), 20, 1, 100)
  const offset = (page - 1) * limit

  // Query param dogrulama
  if (game && !VALID_GAMES.has(game as never)) {
    return NextResponse.json({ error: 'Gecersiz oyun adi' }, { status: 400 })
  }

  // Admin ise service role client kullan (pasif sorulari da gorsun)
  const isAdmin = await checkAdmin(supabase)
  const db = isAdmin ? createServiceRoleClient() : supabase

  let query = db
    .from('questions')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (game) query = query.eq('game', game)
  if (category) query = query.eq('category', category)
  if (difficulty) query = query.eq('difficulty', parseInt(difficulty))
  if (active === 'true') query = query.eq('is_active', true)
  if (active === 'false') query = query.eq('is_active', false)
  if (search && search.length >= 2) {
    // JSONB text arama — content->>question veya content->>sentence
    query = query.or(`content->>question.ilike.%${search}%,content->>sentence.ilike.%${search}%`)
  }

  const { data, count, error } = await query.range(offset, offset + limit - 1)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    { questions: data, total: count, page, limit },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' } },
  )
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const admin = await checkAdmin(supabase)
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { questionId, updates } = body

  if (!questionId) {
    return NextResponse.json({ error: 'Missing questionId' }, { status: 400 })
  }

  // Mass assignment onleme: sadece izin verilen alanlari kabul et
  const ALLOWED_FIELDS = [
    'content', 'game', 'category', 'subcategory', 'topic',
    'difficulty', 'level_tag', 'is_active', 'is_boss',
    'source', 'exam_ref', 'external_id',
  ]
  const safeUpdates = Object.fromEntries(
    Object.entries(updates ?? {}).filter(([k]) => ALLOWED_FIELDS.includes(k))
  )

  if (Object.keys(safeUpdates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { error } = await supabase
    .from('questions')
    .update(safeUpdates)
    .eq('id', questionId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Admin log
  await supabase.from('admin_logs').insert({
    admin_id: admin.id,
    action: 'update_question',
    target_type: 'question',
    target_id: questionId,
    details: updates,
  })

  return NextResponse.json({ success: true })
}
