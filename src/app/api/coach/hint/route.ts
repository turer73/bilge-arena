import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
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
}).strict()

const GEMINI_MODEL = 'gemini-2.5-flash-lite'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

interface QuestionRow {
  id: string
  category: string
  topic: string | null
  content: {
    question?: string
    options?: string[]
    answer?: number
    hint?: string
    solution?: string
  }
  question_outcomes?: Array<{
    is_primary?: boolean
    curriculum_outcomes?: { title?: string } | Array<{ title?: string }> | null
  }>
}

function outcomeTitle(row: QuestionRow): string | null {
  const mapping = row.question_outcomes?.find((item) => item.is_primary)
  const related = mapping?.curriculum_outcomes
  if (Array.isArray(related)) return related[0]?.title ?? null
  return related?.title ?? null
}

function answerDetails(row: QuestionRow) {
  const answerIndex = row.content.answer
  const answerText = typeof answerIndex === 'number' ? row.content.options?.[answerIndex] ?? null : null
  const answerLetter = typeof answerIndex === 'number' && answerIndex >= 0 && answerIndex < 26
    ? String.fromCharCode(65 + answerIndex)
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
 * POST /api/coach/hint { questionId, stage }
 *
 * Client soru metni/cevap/serbest prompt gonderemez. Tum akademik baglam DB'den
 * okunur; hint2/3 cevabi sızdırırsa deterministik fallback kullanilir.
 *
 * Sinir: Bu rehberli bir UI akisi, anti-cheat guvenlik siniri degildir. Mevcut
 * PublicQuestion kontrati answer/solution'i quiz motoruna zaten yollar; gercek
 * sunucu-zorlamali siralama server-authoritative grading donusumu gerektirir.
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

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('questions')
    .select('id, category, topic, content, question_outcomes(is_primary, curriculum_outcomes(title))')
    .eq('id', parsed.data.questionId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    console.error('[CoachHint] soru sorgu hatasi:', error.code)
    return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Soru bulunamadi' }, { status: 404 })

  const question = data as unknown as QuestionRow
  const stage = parsed.data.stage as CoachHintStage
  const { answerText, answerLetter } = answerDetails(question)

  if (stage === 'solution') {
    const solution = question.content.solution?.trim()
    return NextResponse.json(
      {
        stage,
        hint: solution?.slice(0, 2_000) || 'Bu soru için doğrulanmış çözüm henüz eklenmemiş.',
        source: solution ? 'solution' : 'fallback',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }

  let hint: string | null = null
  let source: 'authored' | 'ai' | 'fallback' = 'fallback'
  if (stage === 'hint1') {
    hint = question.content.hint?.trim() || null
    if (hint) source = 'authored'
  } else {
    const prompt = buildCoachPrompt(stage, {
      question: question.content.question ?? '',
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

  return NextResponse.json(
    { stage, hint, source },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
