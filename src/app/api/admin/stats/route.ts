import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()

  // Admin kontrolu
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if ((profile as { role?: string } | null)?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Istatistikleri topla
  const [usersResult, questionsResult, sessionsResult] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('questions').select('id', { count: 'exact', head: true }),
    supabase.from('game_sessions').select('id', { count: 'exact', head: true }),
  ])

  return NextResponse.json({
    totalUsers: usersResult.count ?? 0,
    totalQuestions: questionsResult.count ?? 0,
    totalSessions: sessionsResult.count ?? 0,
  })
}
