import { teacherClassroomWriteLimiter } from '@/lib/teacher-classroom/rate-limits'
import { requireInstitutionPilotRouteContext } from '@/lib/institution-pilot/route-context'
import {
  institutionClassroomCreateInputSchema,
  institutionClassroomCreateResultSchema,
} from '@/lib/institution-pilot/classroom-contract'
import {
  institutionPilotNoStoreJson,
  institutionPilotRpcStatus,
} from '@/lib/institution-pilot/server-contract'

export async function POST(request: Request) {
  const context = await requireInstitutionPilotRouteContext(request, teacherClassroomWriteLimiter)
  if (!context.ok) return context.response

  const input = institutionClassroomCreateInputSchema.safeParse(
    await request.json().catch(() => null),
  )
  if (!input.success) {
    return institutionPilotNoStoreJson(
      { error: 'Sınıf bilgileri geçersiz' },
      { status: 400 },
    )
  }

  const { data, error } = await context.admin.rpc('create_my_institution_classroom', {
    p_user_id: context.userId,
    p_teacher_member_ref: input.data.teacherMemberRef,
    p_name: input.data.name,
    p_request_id: input.data.requestId,
  })
  if (error) {
    return institutionPilotNoStoreJson(
      { error: error.code === '23505' ? 'Bu adla aktif bir sınıf zaten var' : 'Sınıf oluşturulamadı' },
      { status: institutionPilotRpcStatus(error.code) },
    )
  }

  const result = institutionClassroomCreateResultSchema.safeParse(data)
  return result.success
    ? institutionPilotNoStoreJson(result.data, { status: 201 })
    : institutionPilotNoStoreJson({ error: 'Sınıf doğrulanamadı' }, { status: 500 })
}
