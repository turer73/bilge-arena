import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { recordFirstQuestionAttempt } from '@/lib/questions/attempt-store'

const userLimiter = createRateLimiter('questions-grade-user', 120, 60_000)
const ipLimiter = createRateLimiter('questions-grade-ip', 30, 60_000)

const requestSchema = z.object({
  questionId: z.string().uuid(),
  // -1 süre dolumu/boş bırakma; doğru cevap yine submit sonrasında açılır.
  selectedOption: z.number().int().min(-1).max(4),
}).strict()

const contentSchema = z.object({
  options: z.array(z.string()).min(2).max(5),
  answer: z.number().int().min(0).max(4).optional(),
  correct: z.number().int().min(0).max(4).optional(),
  solution: z.string().optional(),
  explanation: z.string().optional(),
}).passthrough().refine(
  (content) => content.answer !== undefined || content.correct !== undefined,
  { message: 'A correct option is required' },
).refine(
  (content) => content.answer === undefined
    || content.correct === undefined
    || content.answer === content.correct,
  { message: 'answer and correct must match' },
).refine(
  (content) => (content.answer ?? content.correct ?? -1) < content.options.length,
  { message: 'correct option must point to an option' },
)

/**
 * Grades one already-presented multiple-choice question without exposing the
 * answer key until after a selection has been submitted. This is deliberately
 * usable by guest previews as well as authenticated quiz sessions.
 */
export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Gecersiz istek' }, { status: 400 })
  }

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  const limiter = user ? userLimiter : ipLimiter
  const identity = user?.id ?? getClientIp(request.headers)
  const actorKey = user ? `user:${identity}` : `ip:${identity}`
  const rateLimit = await limiter.check(identity)
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter ?? 60) } },
    )
  }

  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('questions')
    .select('id, content')
    .eq('id', parsed.data.questionId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    console.error('[/api/questions/grade] soru sorgu hatasi:', error.code)
    return NextResponse.json({ error: 'Notlandirma su anda kullanilamiyor' }, { status: 500 })
  }

  const content = contentSchema.safeParse(data?.content)
  if (!data || !content.success) {
    // Missing, inactive, and malformed questions intentionally share one response.
    return NextResponse.json({ error: 'Soru bulunamadi' }, { status: 404 })
  }

  const correctOption = content.data.answer ?? content.data.correct
  // The schema/refinement guarantees this, but retaining the guard keeps the
  // outward failure uniform if the content contract is ever changed.
  if (correctOption === undefined) {
    return NextResponse.json({ error: 'Soru bulunamadi' }, { status: 404 })
  }

  const authoredSolution = content.data.solution?.trim() || content.data.explanation?.trim()
  const solution = authoredSolution?.slice(0, 2_000) || null
  const acceptedOption = await recordFirstQuestionAttempt(
    actorKey,
    parsed.data.questionId,
    parsed.data.selectedOption,
  )

  return NextResponse.json(
    {
      isCorrect: acceptedOption === correctOption,
      correctOption,
      solution,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
