import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { readVerifiedAttemptQuestionSnapshots, toPublicVerifiedQuestions } from '@/lib/verified-attempts'
import { getFirstQuestionAttempt } from '@/lib/questions/attempt-store'
import { preparationContextSchema, preparationPolicy, preparationRequestSchema, preparationTicketSchema } from '@/lib/diagnostic/tyt-social-preparation'
import { tytSocialPolicyVariantSchema } from '@/lib/exam-policy/tyt-social-contract'

const ipLimiter = createRateLimiter('social-preparation-ip', 120, 60_000)
const userLimiter = createRateLimiter('social-preparation-user', 80, 60_000)
const privateTicket = z.object({
  attemptId: z.uuid(), expiresAt: z.iso.datetime({ offset: true }), policyVersion: preparationPolicy,
  variant: tytSocialPolicyVariantSchema, artifactKind: z.literal('practice'), snapshot: z.unknown(),
  replayed: z.boolean(), composerVersion: z.literal('tyt-social-preparation-v1'), examYear: z.literal(2027),
}).strict()
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: {
    'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
  } })
}
async function actor(request: NextRequest) {
  const ip = await ipLimiter.check(getClientIp(request.headers))
  if (!ip.success) return json({ error: 'İstek şu an işlenemiyor.' }, ip.reason === 'backend_unavailable' ? 503 : 429)
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return json({ error: 'Giriş gerekli.' }, 401)
  const limit = await userLimiter.check(user.id)
  if (!limit.success) return json({ error: 'İstek şu an işlenemiyor.' }, limit.reason === 'backend_unavailable' ? 503 : 429)
  return user.id
}
function rpc(admin: ReturnType<typeof createServiceRoleClient>) {
  // New migration RPCs are deliberately bound; never spread private results.
  return admin.rpc.bind(admin) as unknown as (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string } | null }>
}
export async function GET(request: NextRequest) {
  try {
    const user = await actor(request)
    if (typeof user !== 'string') return user
    if (process.env.TYT_SOCIAL_PREPARATION_ENABLED === 'false') return json({ available: false })
    const result = await rpc(createServiceRoleClient())('get_tyt_social_preparation_context', { p_user_id: user })
    if (result.error) return json({ available: false })
    const parsed = preparationContextSchema.safeParse(result.data)
    return json(parsed.success ? parsed.data : { available: false })
  } catch { return json({ error: 'Hazırlık durumu yüklenemedi.' }, 503) }
}
export async function POST(request: NextRequest) {
  try {
    const user = await actor(request)
    if (typeof user !== 'string') return user
    if (process.env.TYT_SOCIAL_PREPARATION_ENABLED === 'false') return json({ error: 'Hazırlık geçici olarak kapalı.' }, 503)
    let raw: unknown
    try { raw = await request.json() } catch { return json({ error: 'Geçersiz istek.' }, 400) }
    const body = preparationRequestSchema.safeParse(raw)
    if (!body.success || request.headers.get('x-idempotency-key') !== body.data.requestId) return json({ error: 'Geçersiz istek.' }, 400)
    const admin = createServiceRoleClient()
    const result = await rpc(admin)('compose_and_issue_tyt_social_preparation', {
      p_user_id: user, p_variant: body.data.variant, p_request_id: body.data.requestId,
    })
    if (result.error) return json({ error: 'Hazırlık başlatılamadı. Biraz sonra yeniden dene.' }, result.error.code === '22023' ? 409 : 503)
    const parsed = privateTicket.safeParse(result.data)
    if (!parsed.success || parsed.data.variant !== body.data.variant) throw new Error('invalid ticket')
    const ticket = parsed.data
    if (Date.parse(ticket.expiresAt) <= Date.now()) return json({ error: 'Oturumun süresi doldu. Yeni tur başlat.' }, 410)
    // Read the owner-bound canonical snapshot using the existing validated contract.
    const snapshots = await readVerifiedAttemptQuestionSnapshots(admin, { attemptId: ticket.attemptId, userId: user })
    if (snapshots.length !== 20 || snapshots.some((s, i) => s.position !== i + 1 || s.metadata.game !== 'sosyal'
      || s.metadata.examRef !== 'TYT' || s.content.options.length !== 5
      || s.metadata.category !== (i < 5 ? 'tarih' : i < 10 ? 'cografya' : i < 15 || ticket.variant === 'questions_21_25' ? 'felsefe' : 'din_kulturu'))) throw new Error('invalid composition')
    const attempts = await Promise.all(snapshots.map(s => getFirstQuestionAttempt(`attempt:${ticket.attemptId}:user:${user}`, s.questionId)))
    const progress = snapshots.flatMap((s, i) => {
      const selected = attempts[i]
      if (selected === null) return []
      if (!Number.isInteger(selected) || selected < 0 || selected > 4) throw new Error('invalid stored choice')
      const solution = typeof s.content.solution === 'string' ? s.content.solution
        : typeof s.content.explanation === 'string' ? s.content.explanation : null
      return [{ questionId: s.questionId, selectedOption: selected, isCorrect: selected === s.correctOption,
        correctOption: s.correctOption, solution: solution?.slice(0, 2000) ?? null }]
    })
    return json(preparationTicketSchema.parse({ attemptId: ticket.attemptId, expiresAt: ticket.expiresAt,
      examYear: ticket.examYear, questions: toPublicVerifiedQuestions(snapshots), progress }))
  } catch {
    // Do not log the selected range, private answer content or learner identity.
    return json({ error: 'Oturum yüklenemedi. Aynı isteği yeniden deneyebilirsin.' }, 503)
  }
}
