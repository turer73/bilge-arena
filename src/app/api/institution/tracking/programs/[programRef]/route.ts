import { z } from 'zod'
import { requireInstitutionPilotRouteContext } from '@/lib/institution-pilot/route-context'
import { institutionPilotNoStoreJson, institutionPilotRpcStatus } from '@/lib/institution-pilot/server-contract'
import { isInstitutionStudyProgramEnabled, isInstitutionTrackingEnabled } from '@/lib/institution-tracking/server-security'
import {
  institutionStudyProgramMutationResultSchema,
  institutionStudyProgramUpdateInputSchema,
} from '@/lib/institution-tracking/study-program'
import { teacherClassroomWriteLimiter } from '@/lib/teacher-classroom/rate-limits'

const paramsSchema = z.object({ programRef: z.string().regex(/^[0-9a-f]{32}$/) }).strict()

export async function PATCH(
  request: Request,
  routeContext: { params: Promise<{ programRef: string }> },
) {
  if (!isInstitutionTrackingEnabled() || !isInstitutionStudyProgramEnabled()) {
    return institutionPilotNoStoreJson({ error: 'Kurum çalışma programı yapılandırılmadı' }, { status: 503 })
  }
  const context = await requireInstitutionPilotRouteContext(request, teacherClassroomWriteLimiter)
  if (!context.ok) return context.response
  const params = paramsSchema.safeParse(await routeContext.params)
  const body = institutionStudyProgramUpdateInputSchema.safeParse(await request.json().catch(() => null))
  if (!params.success || !body.success) {
    return institutionPilotNoStoreJson({ error: 'Geçersiz program güncelleme isteği' }, { status: 400 })
  }
  const { data, error } = await context.admin.rpc('update_institution_study_program_draft', {
    p_user_id: context.userId,
    p_program_ref: params.data.programRef,
    p_week_start: body.data.weekStart,
    p_daily_minute_limit: body.data.dailyMinuteLimit,
    p_items: body.data.items,
    p_request_id: body.data.requestId,
  })
  if (error) {
    return institutionPilotNoStoreJson({ error: 'Çalışma programı taslağı güncellenemedi' }, { status: institutionPilotRpcStatus(error.code) })
  }
  const result = institutionStudyProgramMutationResultSchema.safeParse(data)
  return result.success
    ? institutionPilotNoStoreJson(result.data)
    : institutionPilotNoStoreJson({ error: 'Çalışma programı taslağı güncellenemedi' }, { status: 500 })
}
