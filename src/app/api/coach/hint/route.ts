import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import {
  supportsStagedCoachQuestion,
  type StagedCoachQuestionContent,
} from '@/lib/coach/question-shape'
import {
  buildCoachPrompt,
  fallbackHint,
  leaksAnswer,
  type CoachHintStage,
} from '@/lib/coach/hints'

const userLimiter = createRateLimiter('coach-hint-user', 20, 60_000)
const ipLimiter = createRateLimiter('coach-hint-ip', 40, 60_000)

const requestSchema = z.object({
  questionId: z.string().uuid(),
  stage: z.enum(['hint1', 'hint2', 'hint3', 'solution']),
  token: z.string().min(1).max(2_000).optional(),
}).strict()

const GEMINI_MODEL = 'gemini-2.5-flash-lite'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const COACH_TOKEN_TTL_MS = 10 * 60_000

interface QuestionRow {
  id: string
  category: string
  topic: string | null
  content: unknown
  question_outcomes?: Array<{
    is_primary?: boolean
    curriculum_outcomes?: { title?: string } | Array<{ title?: string }> | null
  }>
}

type NextCoachStage = 'hint2' | 'hint3' | 'solution'

interface CoachProgressPayload {
  v: 1
  userId: string
  questionId: string
  nextStage: NextCoachStage
  exp: number
}

function coachTokenSecret(): string | null {
  return process.env.COACH_TOKEN_SECRET
    || process.env.SUPABASE_SERVICE_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || null
}

function nextStage(stage: Exclude<CoachHintStage, 'solution'>): NextCoachStage {
  if (stage === 'hint1') return 'hint2'
  if (stage === 'hint2') return 'hint3'
  return 'solution'
}

function signCoachToken(payload: CoachProgressPayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

function verifyCoachToken(
  token: string,
  secret: string,
  expected: Pick<CoachProgressPayload, 'userId' | 'questionId' | 'nextStage'>,
): boolean {
  const parts = token.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false

  try {
    const expectedSignature = createHmac('sha256', secret).update(parts[0]).digest()
    const suppliedSignature = Buffer.from(parts[1], 'base64url')
    if (suppliedSignature.length !== expectedSignature.length
      || !timingSafeEqual(suppliedSignature, expectedSignature)) return false

    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')) as CoachProgressPayload
    return payload.v === 1
      && payload.userId === expected.userId
      && payload.questionId === expected.questionId
      && payload.nextStage === expected.nextStage
      && Number.isInteger(payload.exp)
      && payload.exp > Date.now()
  } catch {
    return false
  }
}

function outcomeTitle(row: QuestionRow): string | null {
  const mapping = row.question_outcomes?.find((item) => item.is_primary)
  const related = mapping?.curriculum_outcomes
  if (Array.isArray(related)) return related[0]?.title ?? null
  return related?.title ?? null
}

function answerDetails(content: StagedCoachQuestionContent) {
  const answerText = content.options[content.answer] ?? null
  const answerLetter = content.answer >= 0 && content.answer < 26
    ? String.fromCharCode(65 + content.answer)
    : null
  return { answerText, answerLetter }
}

async function generateHint(prompt: string): Promise<string | null> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) return null

  const response = await fetch(GEMINI_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 120, temperature: 0.25 },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_LOW_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_LOW_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_LOW_AND_ABOVE' },
      ],
    }),
  })
  if (!response.ok) return null
  const json = await response.json().catch(() => null)
  const candidate = json?.candidates?.[0]
  if (!candidate || candidate.finishReason === 'SAFETY' || candidate.finishReason === 'BLOCKLIST') {
    return null
  }
  const text = candidate.content?.parts?.[0]?.text
  return typeof text === 'string' && text.trim() ? text.trim().slice(0, 500) : null
}

/**
 * POST /api/coach/hint { questionId, stage, token? }
 *
 * Client soru metni/cevap/serbest prompt gonderemez. Tum akademik baglam DB'den
 * okunur. Asama tokeni hint1 -> hint2 -> hint3 -> solution siralamasini
 * serverda zorlar; token tekrar kullanilabilir, ancak stage atlanamaz.
 *
 * Sinir: Bu rehberli bir UI akisi, anti-cheat guvenlik siniri değildir.
 * PublicQuestion answer/solution taşımaz; çözüm yalnız öğrencinin açık talebiyle
 * imzalı aşama zincirinin sonunda açılır.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request.headers)
  const ipRl = await ipLimiter.check(ip)
  if (!ipRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter ?? 60) } },
    )
  }

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const userRl = await userLimiter.check(user.id)
  if (!userRl.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(userRl.retryAfter ?? 60) } },
    )
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Gecersiz istek' }, { status: 400 })

  const secret = coachTokenSecret()
  if (!secret) {
    console.error('[CoachHint] token imza anahtari tanimli değil')
    return NextResponse.json({ error: 'Koc servisi yapilandirilmamis' }, { status: 503 })
  }

  const { stage, token, questionId } = parsed.data
  if (stage === 'hint1') {
    if (token) return NextResponse.json({ error: 'Gecersiz ipucu sirasi' }, { status: 409 })
  } else if (!token || !verifyCoachToken(token, secret, {
    userId: user.id,
    questionId,
    nextStage: stage,
  })) {
    return NextResponse.json({ error: 'Gecersiz veya suresi dolmus ipucu sirasi' }, { status: 409 })
  }

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('questions')
    .select('id, category, topic, content, question_outcomes(is_primary, curriculum_outcomes(title))')
    .eq('id', questionId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    console.error('[CoachHint] soru sorgu hatasi:', error.code)
    return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Soru bulunamadi' }, { status: 404 })

  const question = data as unknown as QuestionRow
  if (!supportsStagedCoachQuestion(question.content)) {
    return NextResponse.json({ error: 'Bu soru tipi kademeli Koc icin desteklenmiyor' }, { status: 422 })
  }
  const content = question.content
  const { answerText, answerLetter } = answerDetails(content)

  if (stage === 'solution') {
    const solution = content.solution?.trim()
    return NextResponse.json(
      {
        stage,
        hint: solution?.slice(0, 2_000) || 'Bu soru için doğrulanmış çözüm henüz eklenmemiş.',
        source: solution ? 'solution' : 'fallback',
        nextToken: null,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  let hint: string | null = null
  let source: 'authored' | 'ai' | 'fallback' = 'fallback'
  if (stage === 'hint1') {
    hint = content.hint?.trim() || null
    if (hint) source = 'authored'
  } else {
    const prompt = buildCoachPrompt(stage, {
      question: content.question,
      category: question.category,
      topic: question.topic,
      outcomeTitle: outcomeTitle(question),
    })
    try {
      hint = await generateHint(prompt)
      if (hint) source = 'ai'
    } catch (error) {
      console.error('[CoachHint] Gemini baglanti hatasi:', error instanceof Error ? error.name : 'unknown')
    }
  }

  if (!hint || leaksAnswer(hint, answerText, answerLetter)) {
    hint = fallbackHint(stage)
    source = 'fallback'
  }

  const nextToken = signCoachToken({
    v: 1,
    userId: user.id,
    questionId,
    nextStage: nextStage(stage),
    exp: Date.now() + COACH_TOKEN_TTL_MS,
  }, secret)

  return NextResponse.json(
    { stage, hint, source, nextToken },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
