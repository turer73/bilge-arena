import { randomUUID } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { replaySocialPilotSession } from '@/lib/diagnostic/social-pilot-session'
import { parseSocialPilotContext, publicSocialPilotContext } from '@/lib/diagnostic/social-pilot-runtime'

const ipLimiter = createRateLimiter('social-discovery-ip', 120, 60_000)
const userLimiter = createRateLimiter('social-discovery-user', 60, 60_000)
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }).strict(),
  z.object({ action: z.literal('answer'), sessionId: z.string().uuid(), questionId: z.string().uuid(),
    selectedOption: z.number().int().min(0).max(4), responseTimeMs: z.number().int().min(100).max(600_000),
    requestId: z.string().uuid() }).strict(),
])
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}
async function authenticate(request: NextRequest): Promise<
  { ok: true; userId: string } | { ok: false; response: NextResponse }
> {
  const ip = await ipLimiter.check(getClientIp(request.headers))
  if (!ip.success) return { ok: false, response: json({ error: 'Çok fazla istek' }, ip.reason === 'backend_unavailable' ? 503 : 429) }
  const client = await createClient()
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) return { ok: false, response: json({ error: 'Giriş yapman gerekiyor' }, 401) }
  const limit = await userLimiter.check(user.id)
  if (!limit.success) return { ok: false, response: json({ error: 'Çok fazla istek' }, limit.reason === 'backend_unavailable' ? 503 : 429) }
  return { ok: true, userId: user.id }
}
async function rpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await createServiceRoleClient().rpc(name as never, args as never)
  if (error) throw error
  return parseSocialPilotContext(data)
}
function failure(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  if (code === 'P0002' || code === '42501') return json({ error: 'Keşif oturumu bulunamadı' }, 404)
  if (code === '40001' || code === '55000') return json({ error: 'Oturum değişti. Son kayıtlı sorudan devam et.' }, 409)
  if (code === 'PGRST202' || code === '42883') return json({ error: 'Sosyal keşfi henüz kullanıma açılmadı' }, 503)
  console.error('[SocialDiscovery] request failed:', code ?? 'internal')
  return json({ error: 'Sosyal keşfi şu an yüklenemedi' }, 500)
}
export async function GET(request: NextRequest) {
  const auth = await authenticate(request)
  if (!auth.ok) return auth.response
  try {
    const context = await rpc('get_social_discovery_pilot_context', { p_user_id: auth.userId, p_session_id: null })
    return json(publicSocialPilotContext(context))
  } catch (error) { return failure(error) }
}
export async function POST(request: NextRequest) {
  const auth = await authenticate(request)
  if (!auth.ok) return auth.response
  let body: z.infer<typeof actionSchema>
  try { body = actionSchema.parse(await request.json()) }
  catch { return json({ error: 'Geçersiz istek' }, 400) }
  try {
    const context = await rpc('get_social_discovery_pilot_context', {
      p_user_id: auth.userId, p_session_id: body.action === 'answer' ? body.sessionId : null,
    })
    if (!context.enabled) return json(publicSocialPilotContext(context))
    if (body.action === 'start') {
      const sessionId = randomUUID()
      const replay = replaySocialPilotSession({ rows: context.rows, seed: sessionId, responses: [] })
      const result = await rpc('start_social_discovery_pilot', { p_user_id: auth.userId,
        p_session_id: sessionId, p_pack_id: context.packId,
        p_first_question_id: replay.nextQuestion!.questionId })
      return json(publicSocialPilotContext(result))
    }
    const session = context.session
    if (!session || session.id !== body.sessionId) return json({ error: 'Keşif oturumu bulunamadı' }, 404)
    const prior = session.responses.find(response => response.questionId === body.questionId)
    // The DB also checks request identity and payload. A retry can arrive after
    // the session advanced or completed; never grade it as the current question.
    let nextQuestionId = session.currentQuestionId
    if (!prior) {
      if (session.status !== 'active' || session.currentQuestionId !== body.questionId
        || Date.parse(session.expiresAt) <= Date.now()) return json({ error: 'Soru artık geçerli değil' }, 409)
      const row = session.rows.find(row => row.id === body.questionId)!
      const replay = replaySocialPilotSession({ rows: session.rows, seed: session.id,
        responses: [...session.responses, { questionId: row.id, revisionId: row.published_revision_id,
          contentSha256: row.content_sha256, selectedOptionIndex: body.selectedOption }] })
      nextQuestionId = replay.nextQuestion?.questionId ?? null
    }
    const result = await rpc('record_social_discovery_pilot_answer', {
      p_user_id: auth.userId, p_session_id: session.id, p_question_id: body.questionId,
      p_selected_option: body.selectedOption, p_response_time_ms: body.responseTimeMs,
      p_request_id: body.requestId, p_expected_answered_count: session.answeredCount,
      p_next_question_id: nextQuestionId,
    })
    const recorded = result.session?.responses.find(response => response.questionId === body.questionId)
    if (result.session?.id !== session.id || !recorded
      || recorded.selectedOptionIndex !== body.selectedOption) throw new Error('social_pilot_record_not_confirmed')
    return json(publicSocialPilotContext(result))
  } catch (error) { return failure(error) }
}
