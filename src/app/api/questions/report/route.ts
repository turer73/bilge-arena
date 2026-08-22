import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { errorReportSubmitSchema } from '@/lib/validations/schemas'
import { contentRpc } from '@/lib/content-governance/route-context'
import { contentGovernanceEnabled } from '@/lib/content-governance/server-security'
import { appealSubmitResultSchema, contentNoStoreJson } from '@/lib/content-governance/server-contract'

const reportLimiter = createRateLimiter('question-report', 5, 60_000)
const APPEAL_REASON = {
  wrong_answer: 'wrong_key', unclear: 'ambiguous', typo: 'invalid_content',
  offensive: 'invalid_content', duplicate: 'other', other: 'other',
} as const

/**
 * POST /api/questions/report — Soru hatasi bildir (#379 Tier 3).
 *
 * Quiz icindeki "Hata Bildir" modali buraya POST eder; kayit error_reports'a
 * status='pending' duser ve admin moderasyon kuyruguna (#378 / /admin/raporlar)
 * girer. RLS insert policy `auth.uid() = user_id` oldugu icin user-scoped
 * client ile user_id = oturum kullanicisi yazilir.
 *
 * Body: { questionId: uuid, report_type: enum, description?: string<=1000 }
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
  const { questionId, attemptId, report_type, description, requestId } = parsed.data

  // During the staged rollout the old client endpoint can remain active after
  // server governance is enabled. Route those writes into the owner-bound SLA
  // queue so no report can fall between the one-time legacy backfill and the
  // later public UI flag.
  if (contentGovernanceEnabled()) {
    let admin: ReturnType<typeof createServiceRoleClient>
    try { admin = createServiceRoleClient() }
    catch { return contentNoStoreJson({ error: 'Rapor sistemi kullanilamiyor' }, { status: 503 }) }
    const { data, error } = await contentRpc(admin, 'submit_question_appeal_v2', {
      p_user_id: user.id,
      p_question_id: questionId,
      p_session_answer_id: null,
      p_attempt_id: attemptId ?? null,
      p_reason: APPEAL_REASON[report_type],
      p_description: description,
      p_request_id: requestId ?? randomUUID(),
    })
    if (error?.code === '23505') return contentNoStoreJson({ status: 'already_reported' })
    if (error) {
      const status = error.code === '42501' ? 403
        : error.code === '23503' || error.code === 'P0002' ? 400
          : error.code === '22023' ? 409 : 500
      return contentNoStoreJson({ error: 'Rapor gonderilemedi' }, { status })
    }
    const result = appealSubmitResultSchema.safeParse(data)
    if (!result.success) return contentNoStoreJson({ error: 'Rapor gonderilemedi' }, { status: 500 })
    return contentNoStoreJson(
      { status: result.data.replayed ? 'already_reported' : 'reported' },
      { status: result.data.replayed ? 200 : 201 },
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
  if (existing) return NextResponse.json({ status: 'already_reported' })

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
    // P2c fix (Codex PR#242): 23505 = unique-violation. Yukaridaki read-before-insert
    // ATOMIK degil — eszamanli istekler (hizli tiklama/coklu sekme/retry) ikisi de "yok"
    // gorup ikisi de insert edebilir. Migration 076 partial-unique index (user_id,
    // question_id WHERE status='pending') bunu DB-seviyesinde garanti eder; ihlali
    // idempotent already_reported olarak ele al (index henuz uygulanmamissa no-op).
    if (error.code === '23505') {
      return NextResponse.json({ status: 'already_reported' })
    }
    console.error('[questions/report] insert hatasi:', error.message)
    return NextResponse.json({ error: 'Rapor gonderilemedi' }, { status: 500 })
  }

  return NextResponse.json({ status: 'reported' }, { status: 201 })
}
