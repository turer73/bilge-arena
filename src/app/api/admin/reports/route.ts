import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'
import { checkAdminMutationRl } from '@/lib/utils/admin-rate-limit'
import { NextResponse, type NextRequest } from 'next/server'
import { reportUpdateSchema } from '@/lib/validations/schemas'
import { dbErrorResponse } from '@/lib/utils/api-error'
import type { TablesUpdate } from '@/types/database.generated'
import { createNotification } from '@/lib/notifications/create'
import { ERROR_REPORT_COIN_REWARD } from '@/lib/constants/rewards'
import { errorReportRewardResultSchema } from '@/lib/rewards/error-report-contract'
import { contentGovernanceEnabled } from '@/lib/content-governance/server-security'

type ReportStatus = 'pending' | 'reviewed' | 'resolved' | 'rejected'

function isReportStatus(value: string): value is ReportStatus {
  return value === 'pending' || value === 'reviewed' || value === 'resolved' || value === 'rejected'
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.reports.view')
  if (!admin) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }
  if (contentGovernanceEnabled()) {
    return NextResponse.json({
      error: 'Eski rapor kuyruğu kapatıldı; soru kalitesi yönetişim kuyruğunu kullanın.',
      code: 'CONTENT_GOVERNANCE_REQUIRED',
      redirect: '/admin/soru-kalite',
    }, { status: 409 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const rawPage = parseInt(searchParams.get('page') ?? '1')
  const page = isNaN(rawPage) || rawPage < 1 ? 1 : Math.min(rawPage, 1000)
  const limit = 20
  const offset = (page - 1) * limit

  let query = supabase
    .from('error_reports')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (status && isReportStatus(status)) {
    query = query.eq('status', status)
  }

  const { data: reports, count, error } = await query.range(offset, offset + limit - 1)

  if (error) {
    return dbErrorResponse('admin/reports', error)
  }

  return NextResponse.json({ reports, total: count, page, limit })
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.reports.manage')
  if (!admin) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }
  if (contentGovernanceEnabled()) {
    return NextResponse.json({
      error: 'Eski rapor karar yolu kapatıldı.',
      code: 'CONTENT_GOVERNANCE_REQUIRED',
      redirect: '/admin/soru-kalite',
    }, { status: 409 })
  }

  const rlRes = await checkAdminMutationRl(admin.id)
  if (rlRes) return rlRes

  const body = await request.json()
  const parsed = reportUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Gecersiz istek' }, { status: 400 })
  }
  const { reportId, status, adminNote } = parsed.data

  const updates: TablesUpdate<'error_reports'> = { status }
  if (adminNote !== undefined) updates.admin_note = adminNote
  // P2e fix (Codex PR#242): resolved'a girerken resolver yaz; resolved'DAN ÇIKARKEN
  // (reviewed/rejected/pending) eski resolver'ı TEMİZLE — yoksa status≠resolved iken
  // çelişkili resolved_by kalıyordu.
  updates.resolved_by = status === 'resolved' ? admin.id : null

  const svc = createServiceRoleClient()
  const { error } = await svc
    .from('error_reports')
    .update(updates)
    .eq('id', reportId)

  if (error) {
    return dbErrorResponse('admin/reports', error)
  }

  // Kabul edilen rapor odullendirilir. Odul + odul izi RPC icinde atomik
  // yazilir ve ayni rapor ikinci kez odullendirilemez (migration 128).
  // Odul YAN ETKIDIR: basarisiz olursa raporun cozulmus olmasi geri alinmaz.
  let rewarded: { awarded: boolean; coins: number; userId: string | null } | null = null
  if (status === 'resolved') {
    const { data: rewardData, error: rewardErr } = await svc.rpc('award_error_report_reward', {
      p_admin_id: admin.id,
      p_report_id: reportId,
      p_coins: ERROR_REPORT_COIN_REWARD,
    })
    if (rewardErr) {
      console.error('[admin/reports] ödül hatası:', rewardErr.code)
    } else {
      const parsed = errorReportRewardResultSchema.safeParse(rewardData)
      if (parsed.success && parsed.data.awarded) {
        const { data: reportRow } = await svc
          .from('error_reports')
          .select('user_id')
          .eq('id', reportId)
          .maybeSingle()
        rewarded = {
          awarded: true,
          coins: parsed.data.coins,
          userId: reportRow?.user_id ?? null,
        }
      }
    }
  }

  // Bildirim yalniz odul GERCEKTEN islendiyse gonderilir; aksi halde
  // ogrenciye tutmayacagimiz bir vaat verilmis olurdu.
  if (rewarded?.awarded && rewarded.userId) {
    await createNotification(svc, {
      userId: rewarded.userId,
      type: 'error_report_rewarded',
      title: '🦉 Teşekkürler, gözünden kaçmadı!',
      body: `Bildirdiğin soruyu kontrol ettik ve haklıydın — düzelttik. Senin sayende o soruyu çözecek herkes daha net bir metin görecek. Hesabına ${rewarded.coins} altın eklendi; mağazadan profil arka planı almak için kullanabilirsin. Böyle hataları bildirmeye devam et! 💪`,
      link: '/arena/magaza',
    })
  }

  // Admin log
  await svc.from('admin_logs').insert({
    admin_id: admin.id,
    action: `report_${status}`,
    target_type: 'report',
    target_id: reportId,
    details: { status, adminNote, rewardedCoins: rewarded?.coins ?? 0 },
  })

  return NextResponse.json({ success: true, rewardedCoins: rewarded?.coins ?? 0 })
}
