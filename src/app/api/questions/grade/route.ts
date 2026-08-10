import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { recordFirstQuestionAttempt } from '@/lib/questions/attempt-store'
import { readVerifiedAttemptQuestionSnapshots } from '@/lib/verified-attempts'

const userLimiter = createRateLimiter('questions-grade-user', 120, 60_000)
const ipLimiter = createRateLimiter('questions-grade-ip', 30, 60_000)

const requestSchema = z.object({
  questionId: z.string().uuid(),
  // -1 süre dolumu/boş bırakma; doğru cevap yine submit sonrasında açılır.
  selectedOption: z.number().int().min(-1).max(4),
  attemptId: z.string().uuid().nullable(),
  strategyEvent: z.object({
    clientEventId: z.string().uuid(),
    sequence: z.number().int().positive().max(201),
    position: z.number().int().min(0).max(99),
  }).strict().optional(),
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
  const rateLimit = await limiter.check(identity)
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Cok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter ?? 60) } },
    )
  }

  const admin = createServiceRoleClient()
  let actorKey: string
  let verifiedQuestionIds: string[] | null = null
  let contentValue: unknown = null

  if (user) {
    if (!parsed.data.attemptId) {
      return NextResponse.json({ error: 'Deneme dogrulanamadi' }, { status: 403 })
    }

    let snapshots
    try {
      snapshots = await readVerifiedAttemptQuestionSnapshots(admin, {
        attemptId: parsed.data.attemptId,
        userId: user.id,
      })
    } catch (error) {
      if ((error as Error).message === 'verified_attempt_snapshot_denied') {
        return NextResponse.json({ error: 'Deneme dogrulanamadi' }, { status: 403 })
      }
      if ((error as Error).message === 'verified_attempt_snapshot_unavailable') {
        console.error(
          '[/api/questions/grade] altyapi hatasi, snapshot okunamadi:',
          (error as Error).cause,
        )
        return NextResponse.json(
          { error: 'Notlandirma gecici olarak kullanilamiyor. Birazdan tekrar dene.' },
          { status: 503, headers: { 'Retry-After': '15' } },
        )
      }
      console.error('[/api/questions/grade] attempt snapshot sorgu hatasi')
      return NextResponse.json(
        { error: 'Notlandirma su anda kullanilamiyor' },
        { status: 500 },
      )
    }
    const snapshot = snapshots.find(item => item.questionId === parsed.data.questionId)
    if (!snapshot) return NextResponse.json({ error: 'Deneme dogrulanamadi' }, { status: 403 })
    actorKey = `attempt:${parsed.data.attemptId}:user:${user.id}`
    verifiedQuestionIds = snapshots.map(item => item.questionId)
    contentValue = snapshot.content
  } else {
    if (parsed.data.attemptId !== null) {
      return NextResponse.json({ error: 'Deneme dogrulanamadi' }, { status: 403 })
    }
    actorKey = `ip:${identity}`
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
    contentValue = data?.content ?? null
  }

  const content = contentSchema.safeParse(contentValue)
  if (!content.success) {
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

  // R2.3 timing is server-receipt telemetry, never the client timeTaken field.
  // This write is deliberately best-effort: experiment analytics cannot make
  // canonical grading fail or hide the answer after a valid first selection.
  if (
    process.env.MOCK_STRATEGY_ENABLED === 'true'
    && user
    && parsed.data.attemptId
    && parsed.data.strategyEvent
    && verifiedQuestionIds
  ) {
    const position = verifiedQuestionIds.indexOf(parsed.data.questionId)
    const event = parsed.data.strategyEvent
    if (position === event.position && event.sequence === position * 2 + 2) {
      try {
        const { error: strategyError } = await admin.rpc('record_verified_exam_strategy_event', {
          p_attempt_id: parsed.data.attemptId,
          p_user_id: user.id,
          p_client_event_id: event.clientEventId,
          p_sequence: event.sequence,
          p_position: event.position,
          p_event_type: 'answer_submitted',
        })
        if (strategyError) {
          console.error('[/api/questions/grade] strategy event hatasi:', strategyError.code)
        }
      } catch {
        console.error('[/api/questions/grade] strategy event beklenmeyen hata')
      }
    }
  }

  return NextResponse.json(
    {
      isCorrect: acceptedOption === correctOption,
      correctOption,
      solution,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
