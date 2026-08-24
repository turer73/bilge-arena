import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { contentRpc } from '@/lib/content-governance/route-context'
import { contentNoStoreJson } from '@/lib/content-governance/server-contract'
import { contentGovernanceEnabled } from '@/lib/content-governance/server-security'
import { questionQualityIndependenceKey } from '@/lib/question-quality/server-risk'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { qualityMissionAnswerLockSchema, qualityMissionSubmitSchema } from '@/lib/validations/schemas'

const missionReadLimiter = createRateLimiter('question-quality-mission-read', 20, 60_000)
const missionWriteLimiter = createRateLimiter('question-quality-mission-write', 10, 60_000)

async function context(request: Request, write = false) {
  if (!contentGovernanceEnabled()) return { response: contentNoStoreJson({ error: 'Kalite görevleri etkin değil' }, { status: 503 }) }
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { response: contentNoStoreJson({ error: 'Yetkisiz' }, { status: 401 }) }
  const limited = await (write ? missionWriteLimiter : missionReadLimiter).check(user.id)
  if (!limited.success) return { response: contentNoStoreJson({ error: 'Çok fazla istek' }, { status: 429 }) }
  try { return { user, admin: createServiceRoleClient(), request } }
  catch { return { response: contentNoStoreJson({ error: 'Kalite görevleri kullanılamıyor' }, { status: 503 }) } }
}

export async function GET(request: Request) {
  const auth = await context(request)
  if ('response' in auth) return auth.response
  let independenceKey: string
  try { independenceKey = questionQualityIndependenceKey(auth.user.id, request.headers) }
  catch { return contentNoStoreJson({ error: 'Kalite görevi risk doğrulaması kullanılamıyor' }, { status: 503 }) }
  const { data, error } = await contentRpc(auth.admin, 'get_next_question_quality_mission', {
    p_user_id: auth.user.id,
    p_independence_key: independenceKey,
    p_request_id: randomUUID(),
  })
  if (error) return contentNoStoreJson({ error: 'Kalite görevi alınamadı' }, { status: 500 })
  return contentNoStoreJson(data && typeof data === 'object' ? data : { mission: null })
}

export async function POST(request: Request) {
  const auth = await context(request, true)
  if ('response' in auth) return auth.response
  const parsed = qualityMissionSubmitSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return contentNoStoreJson({ error: 'Geçersiz kalite değerlendirmesi' }, { status: 400 })
  const input = parsed.data
  const { data, error } = await contentRpc(auth.admin, 'submit_assigned_question_quality_mission', {
    p_user_id: auth.user.id, p_mission_id: input.missionId,
    p_selected_answer_index: input.selectedAnswerIndex, p_verdict: input.verdict,
    p_reason_code: input.reasonCode ?? null, p_proposed_answer_index: input.proposedAnswerIndex ?? null,
    p_correction_text: input.correctionText ?? null, p_explanation: input.explanation,
    p_confidence: input.confidence, p_request_id: input.requestId,
  })
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === '22023' ? 400 : error.code === 'P0003' ? 409 : 500
    return contentNoStoreJson({ error: status === 409 ? 'Görevin süresi dolmuş' : 'Değerlendirme gönderilemedi' }, { status })
  }
  // Hidden controls, peers, models and correctness are deliberately omitted.
  return contentNoStoreJson({ status: 'submitted', rewardEligible: false, receipt: data && typeof data === 'object' })
}

export async function PUT(request: Request) {
  const auth = await context(request, true)
  if ('response' in auth) return auth.response
  const parsed = qualityMissionAnswerLockSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return contentNoStoreJson({ error: 'Geçersiz çözüm seçeneği' }, { status: 400 })
  const input = parsed.data
  const { data, error } = await contentRpc(auth.admin, 'lock_question_quality_mission_answer', {
    p_user_id: auth.user.id,
    p_mission_id: input.missionId,
    p_selected_answer_index: input.selectedAnswerIndex,
    p_request_id: input.requestId,
  })
  if (error) {
    const status = error.code === '42501' ? 403 : error.code === '22023' ? 400 : error.code === 'P0003' ? 409 : 500
    return contentNoStoreJson({ error: status === 409 ? 'Çözüm seçeneği artık değiştirilemez' : 'Çözüm seçeneği kilitlenemedi' }, { status })
  }
  return contentNoStoreJson({ status: 'answer_locked', receipt: data && typeof data === 'object' })
}
