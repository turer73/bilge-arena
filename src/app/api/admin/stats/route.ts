import { createClient } from '@/lib/supabase/server'
import { checkPermission } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.dashboard.view')
  if (!admin) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  // Istatistikleri paralel topla
  const [usersResult, questionsResult, sessionsResult, answersResult, reportsResult] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('questions').select('id', { count: 'exact', head: true }),
    supabase.from('game_sessions').select('id', { count: 'exact', head: true }),
    supabase.from('session_answers').select('id', { count: 'exact', head: true }),
    supabase.from('error_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])

  return NextResponse.json({
    totalUsers: usersResult.count ?? 0,
    totalQuestions: questionsResult.count ?? 0,
    totalSessions: sessionsResult.count ?? 0,
    totalAnswers: answersResult.count ?? 0,
    pendingReports: reportsResult.count ?? 0,
  })
}
