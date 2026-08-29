import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { reportUserSchema } from '@/lib/validations/schemas'

const reportLimiter = createRateLimiter('users-report', 5, 60_000)

/**
 * POST /api/users/report — Kullaniciyi sikayet et.
 * Kayit user_reports'a duser (status='pending'); admin moderasyon kuyrugu icin.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const rl = await reportLimiter.check(user.id)
  if (!rl.success) return NextResponse.json({ error: 'Cok hizli istek' }, { status: 429 })

  const parsed = reportUserSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Gecersiz veri' }, { status: 400 })
  const { reportedUserId, reportType, reason } = parsed.data
  if (reportedUserId === user.id) {
    return NextResponse.json({ error: 'Kendinizi sikayet edemezsiniz' }, { status: 400 })
  }

  const { error } = await createServiceRoleClient().from('user_reports').insert({
    reporter_id: user.id,
    reported_user_id: reportedUserId,
    report_type: reportType,
    reason: reason ?? null,
  })

  if (error) {
    console.error('[Report API] insert hatasi:', error.message)
    return NextResponse.json({ error: 'Sikayet gonderilemedi' }, { status: 500 })
  }

  return NextResponse.json({ status: 'reported' })
}
