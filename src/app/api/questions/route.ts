import { createClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/supabase/admin'
import { NextResponse, type NextRequest } from 'next/server'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { GAME_SLUGS } from '@/lib/constants/games'
import { questionUpdateSchema } from '@/lib/validations/schemas'
import { getClientIp } from '@/lib/utils/client-ip'

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
    const ip = getClientIp(request.headers)
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

  // Admin pasif sorulari da gorsun (RPC icinde admin_view bayragi ile kontrollu)
  const isAdmin = await checkAdmin(supabase)

  // Accent-insensitive arama: "cozum" -> "çözüm" (migration 026 RPC)
  // total_count pencere fonksiyonu ile RPC icinden geliyor.
  const activeFilter = active === 'true' ? true : active === 'false' ? false : null

  const { data: rows, error } = await supabase.rpc('search_questions', {
    search_q: search && search.length >= 2 ? search : null,
    game_filter: game || null,
    category_filter: category || null,
    difficulty_filter: difficulty ? parseInt(difficulty) : null,
    active_filter: activeFilter,
    admin_view: !!isAdmin,
    result_offset: offset,
    result_limit: limit,
  })

  if (error) {
    // PR #74 review LOW: raw error.message Postgres permission/schema bilgisini
    // sizdirir. Migration 041 sonrasi anon hit'lerinde "permission denied for
    // function search_questions" gibi mesajlar gozukurdu. Generic mesaj +
    // server log (debug icin).
    console.error('[/api/questions] RPC error:', error.message)
    return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
  }

  const rawRows = (rows ?? []) as Array<{ total_count: number | string } & Record<string, unknown>>
  const data = rawRows.map(({ total_count: _tc, ...rest }) => rest)
  const count = rawRows.length > 0 ? Number(rawRows[0].total_count) : 0

  // Admin yanitlari admin_view=true ile pasif sorulari icerir; bu datayi CDN'de
  // public cache etmek hem stale toggle/edit gozlenmesine (sayfa nav sonrasi
  // eski durum geri doner) hem de anon session'larda admin-only leak'e yol acar.
  // Admin ise no-store; anon ise mevcut 5dk edge cache davranisi korunur.
  const cacheControl = isAdmin
    ? 'private, no-store'
    : 'public, s-maxage=300, stale-while-revalidate=60'

  return NextResponse.json(
    { questions: data, total: count, page, limit },
    { headers: { 'Cache-Control': cacheControl } },
  )
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const admin = await checkAdmin(supabase)
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = questionUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Missing questionId' }, { status: 400 })
  }
  const { questionId, updates } = parsed.data

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
    // PR #74 review LOW: raw error.message leak — generic + server log
    console.error('[/api/questions PATCH] update error:', error.message)
    return NextResponse.json({ error: 'Guncelleme basarisiz' }, { status: 500 })
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
