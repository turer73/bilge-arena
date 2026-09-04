import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkAdmin } from '@/lib/supabase/admin'
import { NextResponse, type NextRequest } from 'next/server'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { checkAdminMutationRl } from '@/lib/utils/admin-rate-limit'
import { GAME_SLUGS, type GameSlug } from '@/lib/constants/games'
import { questionUpdateSchema } from '@/lib/validations/schemas'
import { getClientIp } from '@/lib/utils/client-ip'
import { parsePublicQuestionContent } from '@/lib/utils/question-public'
import type { Database, TablesUpdate } from '@/types/database.generated'
import { issueVerifiedAttempt, toPublicVerifiedQuestions } from '@/lib/verified-attempts'
import { isTytSocialV2LearnerEnabled } from '@/lib/feature-flags/tyt-social-v2-server'

const questionsLimiter = createRateLimiter('questions', 120, 60_000) // anon: IP bazli (50 öğrenci × ~2 req/dk)
const questionsAuthLimiter = createRateLimiter('questions-auth', 240, 60_000) // authed: user-id bazli (daha yüksek ama sınırsız değil)
const VALID_GAMES = new Set(GAME_SLUGS)

type SearchQuestionsArgs = Database['public']['Functions']['search_questions']['Args']

/** parseInt ile boundary kontrolu: min <= val <= max */
function safeInt(value: string | null, fallback: number, min: number, max: number): number {
  const n = parseInt(value ?? String(fallback))
  if (isNaN(n) || n < min) return fallback
  return Math.min(n, max)
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  // Çift rate limit: anon → IP (120/dk), authed → user-id (240/dk).
  // Authed muafiyeti KALDIRILDI — ele geçmiş/otomatik hesap brute-force'u önler.
  const { data: { user } } = await supabase.auth.getUser()
  const rl = user
    ? await questionsAuthLimiter.check(`user:${user.id}`)
    : await questionsLimiter.check(getClientIp(request.headers))
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek. Lutfen bekleyin.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
    )
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

  // Admin projeksiyonu (pasif sorular + ham icerik + cevap anahtari) ACIK TALEBE
  // baglidir; yalnizca rol yetmez. Onceden kosul salt rol bazliydi ve admin oyun
  // oynarken de admin daline dusuyor, bilet kesilmiyor, grade 403 donuyordu
  // (kesif #1530). Rol kontrolu kalkmiyor: non-admin bu parametreyi gonderse bile
  // public projeksiyon alir.
  const isAdmin = await checkAdmin(supabase)
  const adminProjection = !!isAdmin && searchParams.get('admin_view') === '1'

  // TYT Sosyal aday secimi question-level exam-role snapshot'i gerektirir.
  // `search_questions` sinav kapsamini veya aday politikasini baglamadigi icin
  // bu legacy aktif-liste yuzeyinden bilet kesmek, 206'nin snapshot sinirini
  // ya 500'e dusurur ya da ileride yanlis dala ait kaniti karistirir. Oyun
  // istemcileri examRef=TYT tasiyan policy-aware random route'u kullanmalidir.
  if (isTytSocialV2LearnerEnabled() && user && !adminProjection && game === 'sosyal' && active === 'true') {
    return NextResponse.json(
      {
        error: 'TYT Sosyal icin sinav kapsamli calisma akisini kullanin',
        code: 'TYT_SOCIAL_POLICY_ROUTE_REQUIRED',
      },
      { status: 409, headers: { 'Cache-Control': 'private, no-store' } },
    )
  }

  // Accent-insensitive arama: "cozum" -> "çözüm" (migration 026 RPC)
  // total_count pencere fonksiyonu ile RPC icinden geliyor.
  const activeFilter = active === 'true' ? true : active === 'false' ? false : null

  const searchArgs: SearchQuestionsArgs = {
    admin_view: adminProjection,
    result_offset: offset,
    result_limit: limit,
  }
  if (search && search.length >= 2) searchArgs.search_q = search
  if (game) searchArgs.game_filter = game
  if (category) searchArgs.category_filter = category
  if (difficulty) searchArgs.difficulty_filter = parseInt(difficulty)
  if (activeFilter !== null) searchArgs.active_filter = activeFilter

  // Public projection is an application API, not a direct anonymous PostgREST
  // contract. Use the server-only client so migration 173 can revoke anon RPC
  // execution. Admin projection keeps the caller JWT for the DB-level AAL2 gate.
  const questionReader = adminProjection ? supabase : createServiceRoleClient()
  const { data: rows, error } = await questionReader.rpc('search_questions', searchArgs)

  if (error) {
    // PR #74 review LOW: raw error.message Postgres permission/schema bilgisini
    // sizdirir. Migration 041 sonrasi anon hit'lerinde "permission denied for
    // function search_questions" gibi mesajlar gozukurdu. Generic mesaj +
    // server log (debug icin).
    console.error('[/api/questions] RPC error:', error.message)
    return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
  }

  const rawRows = rows ?? []
  let data: Array<{ id: string }> = adminProjection
    ? rawRows.map(({ total_count: _tc, ...rest }) => rest)
    : rawRows.flatMap((row) => {
        // Cevap anahtari bu dalda hicbir zaman elimize gecmemeli: migration 157
        // sonrasi RPC zaten kirpip gonderiyor, parse de kirpik icerigi kabul edip
        // yalniz public alanlari cikariyor (cift katman).
        const content = parsePublicQuestionContent(row.content)
        if (!content) return []
        return [{
          id: row.id,
          game: row.game,
          category: row.category,
          subcategory: row.subcategory,
          topic: row.topic,
          difficulty: row.difficulty,
          level_tag: row.level_tag,
          content,
          base_points: row.difficulty * 10,
        }]
      })
  const count = rawRows.length > 0 ? Number(rawRows[0].total_count) : 0

  let attemptId: string | null = null
  let expiresAt: string | null = null
  if (user && !adminProjection && game && activeFilter === true && data.length > 0) {
    try {
      const ticket = await issueVerifiedAttempt(createServiceRoleClient(), {
        userId: user.id,
        game: game as GameSlug,
        mode: 'classic',
        questionIds: data.map(question => question.id),
      })
      attemptId = ticket.attemptId
      expiresAt = ticket.expiresAt
      const verifiedQuestions = toPublicVerifiedQuestions(ticket.questionSnapshots)
      if (
        verifiedQuestions.length !== data.length
        || verifiedQuestions.some((question, index) => question.id !== data[index]?.id)
      ) throw new Error('verified_attempt_snapshot_mismatch')
      data = verifiedQuestions
    } catch {
      console.error('[/api/questions] verified attempt issuance failed')
      return NextResponse.json({ error: 'Sorular baslatilamadi' }, { status: 500 })
    }
  }

  // Admin yanitlari admin_view=true ile pasif sorulari icerir; bu datayi CDN'de
  // public cache etmek hem stale toggle/edit gozlenmesine (sayfa nav sonrasi
  // eski durum geri doner) hem de anon session'larda admin-only leak'e yol acar.
  // Admin ise no-store; anon ise mevcut 5dk edge cache davranisi korunur.
  const cacheControl = user || isAdmin
    ? 'private, no-store'
    : 'public, s-maxage=300, stale-while-revalidate=60'

  return NextResponse.json(
    { questions: data, total: count, page, limit, attemptId, expiresAt },
    { headers: { 'Cache-Control': cacheControl } },
  )
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const admin = await checkAdmin(supabase)
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Admin yazma işlemleri ortak kovada sınırlanır; ele geçirilmiş oturumun
  // soru bankası ve admin log üzerinde sınırsız mutasyon yapmasını engeller.
  const rlRes = await checkAdminMutationRl(admin.id)
  if (rlRes) return rlRes

  const body = await request.json()
  const parsed = questionUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Missing questionId' }, { status: 400 })
  }
  const { questionId, updates } = parsed.data

  // Eski istemci sözleşmesini deterministik olarak doğrula. Yönetişim pilotu
  // açıkken içerik/metadata yalnız revision draft, acil kapatma quarantine olur.
  const ALLOWED_FIELDS = [
    'content', 'game', 'category', 'subcategory', 'topic',
    'difficulty', 'level_tag', 'is_active', 'is_boss',
    'source', 'exam_ref', 'external_id',
  ]
  const safeUpdates = Object.fromEntries(
    Object.entries(updates ?? {}).filter(([k]) => ALLOWED_FIELDS.includes(k))
  ) as TablesUpdate<'questions'>

  if (Object.keys(safeUpdates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // Fail-closed: feature flag kapatilsa bile bu route tabloyu dogrudan yazmaz.
  // Karantina, revizyon ve yayin RPC'leri mutasyon + audit'i tek transaction'da
  // gerceklestirir. Migration 163 istemci DML grantlerini de tamamen kaldirir.
  return NextResponse.json(
    {
      error: 'Dogrudan soru guncellemesi kapatildi. Revizyon veya karantina akislarini kullanin.',
      code: 'CONTENT_GOVERNANCE_REQUIRED',
      questionId,
    },
    { status: 409, headers: { 'Cache-Control': 'private, no-store' } },
  )
}
