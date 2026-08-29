import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { errorReportSubmitSchema, qualityClaimSubmitSchema } from '@/lib/validations/schemas'
import { contentRpc } from '@/lib/content-governance/route-context'
import { contentGovernanceEnabled } from '@/lib/content-governance/server-security'
import { appealSubmitResultSchema, contentNoStoreJson } from '@/lib/content-governance/server-contract'
import { questionQualityIndependenceKey } from '@/lib/question-quality/server-risk'
import { getFirstQuestionAttempt } from '@/lib/questions/attempt-store'

const reportLimiter = createRateLimiter('question-report', 5, 60_000)
const APPEAL_REASON = {
  wrong_answer: 'wrong_key', unclear: 'ambiguous', typo: 'invalid_content',
  offensive: 'invalid_content', duplicate: 'other', other: 'other',
} as const

/**
 * POST /api/questions/report — Soru hatasi bildir (#379 Tier 3).
 *
 * Quiz icindeki "Hata Bildir" modali her zaman buraya POST eder. Server bayragi
 * rollback penceresinde legacy error_reports, cutover sonrasinda revizyon-bagli
 * question_appeals yolunu secer; istemci hangi otoriteye yazdigini belirleyemez.
 *
 * Body: { questionId: uuid, report_type: enum, description?: string<=1000,
 *         attemptId?: uuid, proposed_answer_index?: int, correction_text?: string,
 *         confidence?: 0..100 }
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const rl = await reportLimiter.check(user.id)
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Cok hizli istek. Lutfen bekleyin.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
    )
  }

  const parsed = errorReportSubmitSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Gecersiz veri' }, { status: 400 })
  const { questionId, attemptId, report_type, description, requestId,
    proposed_answer_index: proposedAnswerIndex, correction_text: correctionText, confidence } = parsed.data

  // During the staged rollout the old client endpoint can remain active after
  // server governance is enabled. Route those writes into the owner-bound SLA
  // queue so no report can fall between the one-time legacy backfill and the
  // later public UI flag.
  if (contentGovernanceEnabled()) {
    const isAcademicClaim = report_type === 'wrong_answer' || report_type === 'unclear'
    const qualityParsed = isAcademicClaim
      ? qualityClaimSubmitSchema.safeParse(parsed.data)
      : null
    if (qualityParsed && !qualityParsed.success) {
      return contentNoStoreJson({ error: 'Akademik iddia için cevap kanıtı, gerekçe, düzeltme ve güven düzeyi gerekli' }, { status: 400 })
    }
    let solvedAnswerIndex: number | null = null
    let independenceKey: string | null = null
    if (isAcademicClaim) {
      if (!attemptId) return contentNoStoreJson({ error: 'Cevaplanmış soru kanıtı gerekli' }, { status: 400 })
      try {
        solvedAnswerIndex = await getFirstQuestionAttempt(`attempt:${attemptId}:user:${user.id}`, questionId)
      } catch {
        return contentNoStoreJson({ error: 'Cevap kanıtı doğrulanamıyor' }, { status: 503 })
      }
      if (solvedAnswerIndex === null || solvedAnswerIndex < 0) {
        return contentNoStoreJson({ error: 'Akademik iddia için soru önce cevaplanmalı' }, { status: 409 })
      }
      try { independenceKey = questionQualityIndependenceKey(user.id, req.headers) }
      catch { return contentNoStoreJson({ error: 'Kalite kanıtı risk doğrulaması kullanılamıyor' }, { status: 503 }) }
    }
    let admin: ReturnType<typeof createServiceRoleClient>
    try { admin = createServiceRoleClient() }
    catch { return contentNoStoreJson({ error: 'Rapor sistemi kullanilamiyor' }, { status: 503 }) }
    const effectiveRequestId = requestId ?? randomUUID()
    const { data, error } = await contentRpc(admin, 'submit_question_appeal_v2', {
      p_user_id: user.id,
      p_question_id: questionId,
      p_session_answer_id: null,
      p_attempt_id: attemptId ?? null,
      p_reason: APPEAL_REASON[report_type],
      p_description: description,
      p_request_id: effectiveRequestId,
    })
    if (error) {
      const status = error.code === '42501' ? 403
        : error.code === '23503' || error.code === 'P0002' ? 400
          : error.code === '22023' || error.code === '23505' || error.code === '23514' ? 409 : 500
      return contentNoStoreJson({ error: 'Rapor gonderilemedi' }, { status })
    }
    const result = appealSubmitResultSchema.safeParse(data)
    if (!result.success) return contentNoStoreJson({ error: 'Rapor gonderilemedi' }, { status: 500 })
    if (isAcademicClaim) {
      const appealId = result.data.appealId
      if (!appealId) return contentNoStoreJson({ error: 'Rapor gonderilemedi' }, { status: 500 })
      const { data: claimData, error: claimError } = await contentRpc(admin, 'submit_question_quality_claim', {
        p_user_id: user.id,
        p_appeal_id: appealId,
        p_solved_answer_index: solvedAnswerIndex,
        p_verdict: 'flawed',
        p_reason_code: APPEAL_REASON[report_type],
        p_proposed_answer_index: proposedAnswerIndex ?? null,
        p_correction_text: correctionText?.trim() || null,
        p_explanation: description,
        p_confidence: confidence,
        p_independence_key: independenceKey!,
        p_request_id: effectiveRequestId,
      })
      if (claimError) {
        const status = claimError.code === '42501' ? 403
          : claimError.code === '22023' || claimError.code === '23505' || claimError.code === 'P0003' ? 409 : 500
        return contentNoStoreJson({ error: 'Rapor gonderilemedi' }, { status })
      }
      // Deliberately expose no model, source, consensus, or option statistics.
      // Those are private governance evidence and never a user-facing verdict.
      if (!claimData || typeof claimData !== 'object') {
        return contentNoStoreJson({ error: 'Rapor gonderilemedi' }, { status: 500 })
      }
    }
    return contentNoStoreJson(
      {
        status: result.data.replayed || result.data.alreadyReported ? 'already_reported' : 'reported',
        rewardEligible: false,
      },
      { status: result.data.replayed || result.data.alreadyReported ? 200 : 201 },
    )
  }

  // Dedup: ayni kullanici ayni soru icin zaten bekleyen rapor acmissa tekrar
  // satir uretme (spam + kuyruk sismesi onlemi). Idempotent yanit doner.
  const { data: existing } = await supabase
    .from('error_reports')
    .select('id')
    .eq('user_id', user.id)
    .eq('question_id', questionId)
    .eq('status', 'pending')
    .maybeSingle()
  if (existing) return NextResponse.json({ status: 'already_reported', rewardEligible: true })

  const { error } = await supabase.from('error_reports').insert({
    user_id: user.id,
    question_id: questionId,
    report_type,
    description: description || null,
  })

  if (error) {
    // 23503 = FK ihlali (gecersiz/silinmis questionId) -> 400; digerleri generic 500.
    if (error.code === '23503') {
      return NextResponse.json({ error: 'Soru bulunamadi' }, { status: 400 })
    }
    // A SQLSTATE class is not an idempotency proof. Only the explicit read above
    // or a named RPC result may produce already_reported; an arbitrary unique
    // violation remains visible as a conflict.
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Rapor gonderilemedi' }, { status: 409 })
    }
    console.error('[questions/report] insert hatasi:', error.message)
    return NextResponse.json({ error: 'Rapor gonderilemedi' }, { status: 500 })
  }

  return NextResponse.json({ status: 'reported', rewardEligible: true }, { status: 201 })
}
