import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'

const exportLimiter = createRateLimiter('account-data-export', 2, 3_600_000)

export const dynamic = 'force-dynamic'

export async function GET() {
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Yetkisiz' }, {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const limited = await exportLimiter.check(user.id)
  if (!limited.success) {
    const unavailable = limited.reason === 'backend_unavailable'
    return NextResponse.json(
      { error: unavailable ? 'Güvenlik servisi geçici olarak kullanılamıyor' : 'Dışa aktarma limiti aşıldı' },
      {
        status: unavailable ? 503 : 429,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': String(limited.retryAfter ?? 60),
        },
      },
    )
  }

  const db = createServiceRoleClient()
  const [
    profile, consents, gameSessions, achievements, topicProgress, questionHistory,
    classroomMemberships, institutionMemberships, ownedClassrooms,
    ownedAssignments, studyPrograms, followups, reports,
  ] = await Promise.all([
    db.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    db.from('consent_logs').select('*').eq('user_id', user.id).order('created_at'),
    db.from('game_sessions').select('*').eq('user_id', user.id).order('created_at'),
    db.from('user_achievements').select('*').eq('user_id', user.id),
    db.from('user_topic_progress').select('*').eq('user_id', user.id),
    db.from('user_question_history').select('*').eq('user_id', user.id).order('created_at'),
    db.from('teacher_classroom_memberships').select('*').eq('student_id', user.id),
    db.from('pilot_institution_memberships').select('*').eq('user_id', user.id),
    db.from('teacher_classrooms').select('*').eq('teacher_id', user.id),
    db.from('teacher_assignments').select('*').eq('teacher_id', user.id),
    db.from('institution_study_programs').select('*').or(`student_id.eq.${user.id},teacher_id.eq.${user.id}`),
    db.from('institution_student_followups').select('*').or(`student_id.eq.${user.id},teacher_id.eq.${user.id}`),
    db.from('institution_student_reports').select('*').or(`student_id.eq.${user.id},teacher_id.eq.${user.id}`),
  ])

  const results = [
    profile, consents, gameSessions, achievements, topicProgress, questionHistory,
    classroomMemberships, institutionMemberships, ownedClassrooms,
    ownedAssignments, studyPrograms, followups, reports,
  ]
  const firstError = results.find((result) => result.error)?.error
  if (firstError) {
    console.error('[Account Export] veri derleme hatasi:', firstError.message)
    return NextResponse.json({ error: 'Veri dışa aktarılamadı' }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const exportedAt = new Date().toISOString()
  const payload = {
    schemaVersion: 'bilge-arena-dsar-v1',
    exportedAt,
    account: {
      id: user.id,
      email: user.email ?? null,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
    },
    data: {
      profile: profile.data,
      consentLogs: consents.data ?? [],
      gameSessions: gameSessions.data ?? [],
      achievements: achievements.data ?? [],
      topicProgress: topicProgress.data ?? [],
      questionHistory: questionHistory.data ?? [],
      classroomMemberships: classroomMemberships.data ?? [],
      institutionMemberships: institutionMemberships.data ?? [],
      ownedClassrooms: ownedClassrooms.data ?? [],
      ownedAssignments: ownedAssignments.data ?? [],
      institutionStudyPrograms: studyPrograms.data ?? [],
      institutionFollowups: followups.data ?? [],
      institutionReports: reports.data ?? [],
    },
  }

  return new Response(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="bilge-arena-verilerim-${exportedAt.slice(0, 10)}.json"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
