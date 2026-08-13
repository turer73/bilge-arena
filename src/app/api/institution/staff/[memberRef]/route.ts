import { getInstitutionManagerWorkspace } from '@/lib/institution-pilot/manager-workspace'
import { requireInstitutionPilotRouteContext } from '@/lib/institution-pilot/route-context'
import { teacherClassroomWriteLimiter } from '@/lib/teacher-classroom/rate-limits'
import {
  institutionPilotNoStoreJson,
  institutionPilotRpcStatus,
  institutionPilotTeacherRemoveInputSchema,
  institutionPilotTeacherRemoveResultSchema,
} from '@/lib/institution-pilot/server-contract'

const memberRefPattern = /^[0-9a-f]{32}$/

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ memberRef: string }> },
) {
  const context = await requireInstitutionPilotRouteContext(request, teacherClassroomWriteLimiter)
  if (!context.ok) return context.response

  const { memberRef } = await params
  const body = institutionPilotTeacherRemoveInputSchema.safeParse(
    await request.json().catch(() => null),
  )
  if (!memberRefPattern.test(memberRef) || !body.success) {
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

  const { data, error } = await context.admin.rpc('remove_pilot_institution_teacher', {
    p_user_id: context.userId,
    p_institution_id: manager.workspace.institution.id,
    p_member_ref: memberRef,
    p_request_id: body.data.requestId,
  })
  if (error) {
    return institutionPilotNoStoreJson(
      { error: 'Kurum öğretmeni çıkarılamadı' },
      { status: institutionPilotRpcStatus(error.code) },
    )
  }

  const result = institutionPilotTeacherRemoveResultSchema.safeParse(data)
  return result.success
    ? institutionPilotNoStoreJson(result.data)
    : institutionPilotNoStoreJson(
      { error: 'Kurum öğretmeni çıkarılamadı' },
      { status: 500 },
    )
}
