import { NextResponse, type NextRequest } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { GAME_SLUGS } from '@/lib/constants/games'
import { parseQuestionRows, toPublicQuestion } from '@/lib/utils/question-public'
import {
  ACTIVATION_REWARD_COOKIE,
  ACTIVATION_REWARD_TTL_SECONDS,
  createActivationRewardToken,
} from '@/lib/activation/server-reward'

// Misafir önizlemesi için kısıtlı IP rate limit: 20/saat
const ipLimiter = createRateLimiter('questions-preview-ip', 20, 3_600_000)

const VALID_GAMES = new Set(GAME_SLUGS)
const VALID_EXAM_REFS = new Set(['TYT', 'LGS', 'AYT-SAY', 'AYT-EA', 'AYT-SOZ'])

/**
 * GET /api/questions/preview?game=X[&category=Y&difficulty=Z&examRef=TYT]
 *
 * Auth gerektirmeyen misafir önizleme endpointi.
 * Kayıt olmadan oynamayı deneyen kullanıcılara 1 gerçek soru verir.
 * Seçili filtreler (kategori, zorluk, sınav) uygulanır.
 * Zorluk havuzu boşsa yalnız zorluk gevşetilir. Sınav ve kategori kullanıcının
 * açık kapsam seçimidir; başka bir sınav/dersten soru göstermemek için korunur.
 *
 * - Auth yok (anon erişim)
 * - Service-role ile DB'den random aktif soru
 * - IP rate limit: 20/saat
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers)
  const ipRl = await ipLimiter.check(ip)
  if (!ipRl.success) {
    return NextResponse.json(
      { error: 'Çok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter ?? 3600) } },
    )
  }

  const { searchParams } = new URL(request.url)
  const game = searchParams.get('game')
  if (!game || !VALID_GAMES.has(game as never)) {
    return NextResponse.json({ error: 'Geçerli oyun belirtilmedi' }, { status: 400 })
  }

  const category = searchParams.get('category') || null
  const difficultyRaw = searchParams.get('difficulty')
  const difficulty = difficultyRaw ? parseInt(difficultyRaw, 10) : null
  const examRefRaw = searchParams.get('examRef')
  const examRef = examRefRaw && VALID_EXAM_REFS.has(examRefRaw) ? examRefRaw : null
  const activationRequested = searchParams.get('activation') === '1'

  if (activationRequested && process.env.ACTIVATION_EXPERIMENT_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Akış etkin değil' }, { status: 404 })
  }

  const admin = createServiceRoleClient()

  // Filtreli RPC argümanları
  const rpcArgs: {
    p_game: string
    p_limit: number
    p_category?: string
    p_difficulty?: number
    p_exam_ref?: string
  } = { p_game: game, p_limit: 3 }

  if (category) rpcArgs.p_category = category
  if (difficulty && Number.isFinite(difficulty)) rpcArgs.p_difficulty = difficulty
  if (examRef) rpcArgs.p_exam_ref = examRef

  let { data, error } = await admin.rpc('select_random_questions', rpcArgs)

  // Yalnız zorluk tercihini gevşet. 05/08/2026 geri bildirimi: eski fallback
  // TYT+biyoloji kapsamını da silip aktif AYT biyoloji sorusu döndürebiliyordu.
  if (!error && (!data || data.length === 0) && difficulty !== null) {
    const fallbackArgs: {
      p_game: string
      p_limit: number
      p_category?: string
      p_exam_ref?: string
    } = { p_game: game, p_limit: 3 }
    if (category) fallbackArgs.p_category = category
    if (examRef) fallbackArgs.p_exam_ref = examRef

    const fallback = await admin.rpc('select_random_questions', fallbackArgs)
    if (!fallback.error) {
      data = fallback.data
      error = fallback.error
    }
  }

  if (error) {
    console.error('[/api/questions/preview] RPC hatası:', error.code)
    return NextResponse.json({ error: 'Soru alınamadı' }, { status: 500 })
  }

  // RPC/veri driftine karşı defense-in-depth: açık sınav ve kategori kapsamına
  // uymayan satır hiçbir koşulda public yanıta çıkmaz.
  const questions = parseQuestionRows(data).filter((question) =>
    question.game === game
    && (!category || question.category === category)
    && (!examRef || question.exam_ref === examRef)
  )
  const question = questions[0] ?? null
  const publicQuestions = questions.slice(0, 3).map(toPublicQuestion)

  if (activationRequested && publicQuestions.length !== 3) {
    return NextResponse.json(
      { error: 'Üç soruluk akış şu anda hazırlanamadı' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const response = NextResponse.json(
    // `question` eski istemciler icin korunur. Iki alan da public whitelist'ten gecer.
    { question: question ? toPublicQuestion(question) : null, questions: publicQuestions },
    { headers: { 'Cache-Control': 'no-store' } },
  )

  if (activationRequested && publicQuestions.length > 0) {
    const rewardToken = createActivationRewardToken(publicQuestions.map((item) => item.id))
    if (!rewardToken) {
      return NextResponse.json(
        { error: 'Aktivasyon ödülü yapılandırılmamış' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      )
    }
    response.cookies.set(ACTIVATION_REWARD_COOKIE, rewardToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ACTIVATION_REWARD_TTL_SECONDS,
    })
  }

  return response
}
