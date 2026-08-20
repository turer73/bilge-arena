import { requireInstitutionPilotRouteContext } from '@/lib/institution-pilot/route-context'
import { teacherClassroomWriteLimiter } from '@/lib/teacher-classroom/rate-limits'
import {
  institutionPilotNoStoreJson,
  institutionPilotManagerTeacherInputSchema,
  institutionPilotManagerTeacherResultSchema,
  institutionPilotRpcStatus,
  institutionPilotTeacherAddInputSchema,
  institutionPilotTeacherAddResultSchema,
} from '@/lib/institution-pilot/server-contract'

export async function PATCH(request: Request) {
  const context = await requireInstitutionPilotRouteContext(request, teacherClassroomWriteLimiter)
  if (!context.ok) return context.response

  const body = institutionPilotManagerTeacherInputSchema.safeParse(
    await request.json().catch(() => null),
  )
  if (!body.success) {
    return institutionPilotNoStoreJson(
      { error: 'Geçersiz yönetici öğretmenliği isteği' },
      { status: 400 },
    )
  }

  const { data, error } = await context.admin.rpc('set_my_institution_manager_teacher_role', {
    p_user_id: context.userId,
    p_enabled: body.data.enabled,
    p_request_id: body.data.requestId,
  })
  if (error) {
    const status = institutionPilotRpcStatus(error.code)
    return institutionPilotNoStoreJson(
      {
        error: error.code === 'P0003'
          ? 'Aktif sınıflarınız varken öğretmenlik rolü kapatılamaz'
          : 'Yönetici öğretmenliği güncellenemedi',
      },
      { status },
    )
  }

  const result = institutionPilotManagerTeacherResultSchema.safeParse(data)
  return result.success
    ? institutionPilotNoStoreJson(result.data)
    : institutionPilotNoStoreJson(
      { error: 'Yönetici öğretmenliği doğrulanamadı' },
      { status: 500 },
    )
}

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

  const { data, error } = await context.admin.rpc('add_my_institution_teacher_by_email', {
    p_user_id: context.userId,
    p_teacher_email: body.data.teacherEmail,
    p_request_id: body.data.requestId,
  })
  if (error) {
    const status = institutionPilotRpcStatus(error.code)
    return institutionPilotNoStoreJson(
      {
        error: status === 404
          ? 'Bu e-posta ile doğrulanmış bir Bilge Arena hesabı bulunamadı'
          : status === 409
          ? 'Öğretmen başka bir kuruma bağlı olabilir veya kurum personel sınırı dolmuş olabilir'
          : 'Kurum öğretmeni eklenemedi',
      },
      { status },
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
