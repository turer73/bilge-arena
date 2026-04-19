import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  // 1) Auth: user-scoped client ile admin iznini dogrula (RLS aktif, JWT guvenli)
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.dashboard.view')
  if (!admin) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  // 2) Aggregate count sorgulari: service role ile RLS'i bypass et.
  //    User-scoped client ile sayarsak admin yalnizca kendi satirlarini gorur
  //    (game_sessions, session_answers owner-RLS filtrelenir) — dashboard'da
  //    tutarsiz rakamlara yol acar. Yetki dogrulandiktan sonra service role
  //    guvenli: client bundle'a sizmaz, asla kullaniciya donulmez.
  const admindb = createServiceRoleClient()

  // Istatistikleri paralel topla
  const [usersResult, questionsResult, sessionsResult, answersResult, reportsResult] = await Promise.all([
    admindb.from('profiles').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    admindb.from('questions').select('id', { count: 'exact', head: true }),
    admindb.from('game_sessions').select('id', { count: 'exact', head: true }),
    admindb.from('session_answers').select('id', { count: 'exact', head: true }),
    admindb.from('error_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])

  return NextResponse.json(
    {
      totalUsers: usersResult.count ?? 0,
      totalQuestions: questionsResult.count ?? 0,
      totalSessions: sessionsResult.count ?? 0,
      totalAnswers: answersResult.count ?? 0,
      pendingReports: reportsResult.count ?? 0,
    },
    {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
    },
  )
}
