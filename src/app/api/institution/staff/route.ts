import { getInstitutionManagerWorkspace } from '@/lib/institution-pilot/manager-workspace'
import { requireInstitutionPilotRouteContext } from '@/lib/institution-pilot/route-context'
import { teacherClassroomWriteLimiter } from '@/lib/teacher-classroom/rate-limits'
import {
  institutionPilotNoStoreJson,
  institutionPilotRpcStatus,
  institutionPilotTeacherAddInputSchema,
  institutionPilotTeacherAddResultSchema,
} from '@/lib/institution-pilot/server-contract'

export async function POST(request: Request) {
  const context = await requireInstitutionPilotRouteContext(request, teacherClassroomWriteLimiter)
  if (!context.ok) return context.response

  const body = institutionPilotTeacherAddInputSchema.safeParse(
    await request.json().catch(() => null),
  )
  if (!body.success) {
    return institutionPilotNoStoreJson(
      { error: 'Geçersiz kurum öğretmeni isteği' },
      { status: 400 },
    )
  }

  const manager = await getInstitutionManagerWorkspace(context.admin, context.userId)
  if (!manager.ok) {
    return institutionPilotNoStoreJson(
      { error: 'Kurum yöneticisi yetkisi gerekli' },
      { status: manager.status },
    )
  }

  const { data, error } = await context.admin.rpc('add_pilot_institution_teacher', {
    p_user_id: context.userId,
    p_institution_id: manager.workspace.institution.id,
    p_teacher_user_id: body.data.teacherUserId,
    p_request_id: body.data.requestId,
  })
  if (error) {
    return institutionPilotNoStoreJson(
      { error: 'Kurum öğretmeni eklenemedi' },
      { status: institutionPilotRpcStatus(error.code) },
    )
  }

  const result = institutionPilotTeacherAddResultSchema.safeParse(data)
  return result.success
    ? institutionPilotNoStoreJson(result.data)
    : institutionPilotNoStoreJson(
      { error: 'Kurum öğretmeni eklenemedi' },
      { status: 500 },
    )
}
