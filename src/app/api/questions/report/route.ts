import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { errorReportSubmitSchema } from '@/lib/validations/schemas'

const reportLimiter = createRateLimiter('question-report', 5, 60_000)

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
  const { questionId, report_type, description } = parsed.data

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
    console.error('[questions/report] insert hatasi:', error.message)
    return NextResponse.json({ error: 'Rapor gonderilemedi' }, { status: 500 })
  }

  return NextResponse.json({ status: 'reported' }, { status: 201 })
}
