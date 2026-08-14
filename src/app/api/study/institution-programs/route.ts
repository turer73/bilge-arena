import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { institutionPilotNoStoreJson, institutionPilotRpcStatus } from '@/lib/institution-pilot/server-contract'
import { isInstitutionStudyProgramEnabled, isInstitutionTrackingEnabled } from '@/lib/institution-tracking/server-security'
import { institutionStudentProgramsSchema } from '@/lib/institution-tracking/student-program'
import { checkTeacherClassroomRateLimit, teacherClassroomReadLimiter } from '@/lib/teacher-classroom/rate-limits'
import { trDayString } from '@/lib/utils/tr-date'

export async function GET(request: Request) {
  if (!isInstitutionTrackingEnabled() || !isInstitutionStudyProgramEnabled()) {
    return institutionPilotNoStoreJson({ asOfDate: trDayString(), programs: [] }, { status: 200 })
  }
  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) return institutionPilotNoStoreJson({ error: 'Yetkisiz' }, { status: 401 })
  const rateLimit = await checkTeacherClassroomRateLimit(teacherClassroomReadLimiter, user.id, request.headers)
  if (!rateLimit.success) {
    return institutionPilotNoStoreJson({ error: 'Çok fazla istek' }, {
      status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter ?? 60) },
    })
  }
  let admin: ReturnType<typeof createServiceRoleClient>
  try { admin = createServiceRoleClient() }
  catch { return institutionPilotNoStoreJson({ error: 'Kurum programı yapılandırılmadı' }, { status: 503 }) }
  const { data, error } = await admin.rpc('get_my_institution_study_programs', {
    p_user_id: user.id,
    p_as_of_date: trDayString(),
  })
  if (error) {
    return institutionPilotNoStoreJson({ error: 'Kurum çalışma programı alınamadı' }, { status: institutionPilotRpcStatus(error.code) })
  }
  const result = institutionStudentProgramsSchema.safeParse(data)
  return result.success
    ? institutionPilotNoStoreJson(result.data)
    : institutionPilotNoStoreJson({ error: 'Kurum çalışma programı alınamadı' }, { status: 500 })
}
