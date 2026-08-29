import { requireInstitutionPilotRouteContext } from '@/lib/institution-pilot/route-context'
import { teacherClassroomWriteLimiter } from '@/lib/teacher-classroom/rate-limits'
import {
  institutionPilotManagerTransferInputSchema,
  institutionPilotManagerTransferResultSchema,
  institutionPilotNoStoreJson,
  institutionPilotRpcStatus,
} from '@/lib/institution-pilot/server-contract'

export async function POST(request: Request) {
  const context = await requireInstitutionPilotRouteContext(request, teacherClassroomWriteLimiter)
  if (!context.ok) return context.response

  const input = institutionPilotManagerTransferInputSchema.safeParse(
    await request.json().catch(() => null),
  )
  if (!input.success) {
    return institutionPilotNoStoreJson(
      { error: 'Geçersiz yönetici devri isteği' },
      { status: 400 },
    )
  }

  const { data, error } = await context.admin.rpc('transfer_my_pilot_institution_manager', {
    p_user_id: context.userId,
    p_new_manager_member_ref: input.data.newManagerMemberRef,
    p_request_id: input.data.requestId,
  })
  if (error) {
    const status = institutionPilotRpcStatus(error.code)
    return institutionPilotNoStoreJson(
      {
        error: status === 404
          ? 'Yeni yönetici aynı kurumda aktif bir öğretmen olmalıdır'
          : status === 403
          ? 'Yönetici devri için kurum yöneticisi yetkisi gerekli'
          : 'Yönetici devri tamamlanamadı',
      },
      { status },
    )
  }

  const result = institutionPilotManagerTransferResultSchema.safeParse(data)
  return result.success
    ? institutionPilotNoStoreJson(result.data)
    : institutionPilotNoStoreJson(
      { error: 'Yönetici devri doğrulanamadı' },
      { status: 500 },
    )
}
