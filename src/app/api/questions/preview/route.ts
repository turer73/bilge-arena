import { NextResponse, type NextRequest } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import {
  GAMES,
  GAME_SLUGS,
  getCategoriesForExam,
  normalizeCategoryAlias,
  type GameSlug,
} from '@/lib/constants/games'
import { parseQuestionRows, toPublicQuestion } from '@/lib/utils/question-public'
import {
  ACTIVATION_REWARD_COOKIE,
  ACTIVATION_REWARD_TTL_SECONDS,
  createActivationRewardToken,
} from '@/lib/activation/server-reward'
import {
  createGuestGradingToken,
  GUEST_GRADING_COOKIE,
  GUEST_GRADING_TTL_SECONDS,
} from '@/lib/questions/guest-grading-session'
import { isTytSocialV2LearnerEnabled } from '@/lib/feature-flags/tyt-social-v2-server'

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
  const tytSocialV2Enabled = isTytSocialV2LearnerEnabled()
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

  const gameSlug = game as GameSlug
  const categoryRaw = searchParams.get('category')
  const difficultyRaw = searchParams.get('difficulty')
  const difficulty = difficultyRaw === null ? null : Number(difficultyRaw)
  if (difficulty !== null && (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5)) {
    return NextResponse.json({ error: 'Gecerli zorluk belirtilmedi' }, { status: 400 })
  }
  const examRefRaw = searchParams.get('examRef')
  if (examRefRaw !== null && !VALID_EXAM_REFS.has(examRefRaw)) {
    return NextResponse.json({ error: 'Gecerli sinav kapsami belirtilmedi' }, { status: 400 })
  }
  const examRef = examRefRaw
  if (tytSocialV2Enabled && gameSlug === 'sosyal' && examRef === null) {
    return NextResponse.json(
      { error: 'Sosyal icin exact sinav kapsami belirtilmelidir' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  const category = normalizeCategoryAlias(gameSlug, categoryRaw)
  if (categoryRaw !== null && (!category || !GAMES[gameSlug].categories.includes(category))) {
    return NextResponse.json({ error: 'Gecerli kategori belirtilmedi' }, { status: 400 })
  }
  if (category && !getCategoriesForExam(gameSlug, examRef).includes(category)) {
    return NextResponse.json({ error: 'Kategori sinav kapsamiyla uyumsuz' }, { status: 400 })
  }

  // Misafir oturumunda aday dalı yoktur. Social/TYT'de yalnız exam_ref filtresi
  // uygulamak 16-20 Din ile 21-25 ilave Felsefe satırlarını karıştırabilir.
  // Onaylı common-role projeksiyonu yayınlanana kadar yanlış dal sorusu
  // göstermek yerine bu tek yüzeyi kapalı tut.
  if (tytSocialV2Enabled && gameSlug === 'sosyal' && examRef === 'TYT') {
    return NextResponse.json(
      { error: 'TYT Sosyal misafir onizlemesi hazirlaniyor' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    )
  }
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
  } else if (publicQuestions.length > 0) {
    const gradingToken = createGuestGradingToken(publicQuestions.map((item) => item.id))
    if (!gradingToken) {
      return NextResponse.json(
        { error: 'Misafir oturumu hazırlanamadı' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      )
    }
    response.cookies.set(GUEST_GRADING_COOKIE, gradingToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: GUEST_GRADING_TTL_SECONDS,
    })
  }

  return response
}
