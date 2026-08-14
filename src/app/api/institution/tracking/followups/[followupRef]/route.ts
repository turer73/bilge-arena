import { z } from 'zod'
import { requireInstitutionPilotRouteContext } from '@/lib/institution-pilot/route-context'
import { institutionPilotNoStoreJson, institutionPilotRpcStatus } from '@/lib/institution-pilot/server-contract'
import { institutionFollowupMutationSchema, institutionFollowupResolveInputSchema } from '@/lib/institution-tracking/followup'
import { isInstitutionTrackingEnabled } from '@/lib/institution-tracking/server-security'
import { teacherClassroomWriteLimiter } from '@/lib/teacher-classroom/rate-limits'

const paramsSchema = z.object({ followupRef: z.string().regex(/^[0-9a-f]{32}$/) }).strict()

export async function PATCH(
  request: Request,
  routeContext: { params: Promise<{ followupRef: string }> },
) {
  if (!isInstitutionTrackingEnabled()) {
    return institutionPilotNoStoreJson({ error: 'Kurum öğrenci takibi yapılandırılmadı' }, { status: 503 })
  }
  const context = await requireInstitutionPilotRouteContext(request, teacherClassroomWriteLimiter)
  if (!context.ok) return context.response
  const params = paramsSchema.safeParse(await routeContext.params)
  const body = institutionFollowupResolveInputSchema.safeParse(await request.json().catch(() => null))
  if (!params.success || !body.success) {
    return institutionPilotNoStoreJson({ error: 'Geçersiz öğrenci takip kapatma isteği' }, { status: 400 })
  }
  const { data, error } = await context.admin.rpc('resolve_institution_student_followup', {
    p_user_id: context.userId,
    p_followup_ref: params.data.followupRef,
    p_request_id: body.data.requestId,
  })
  if (error) {
    return institutionPilotNoStoreJson(
      { error: 'Öğrenci takip kaydı kapatılamadı' },
      { status: institutionPilotRpcStatus(error.code) },
    )
  }
  const result = institutionFollowupMutationSchema.safeParse(data)
  return result.success
    ? institutionPilotNoStoreJson(result.data)
    : institutionPilotNoStoreJson({ error: 'Öğrenci takip kaydı kapatılamadı' }, { status: 500 })
}
