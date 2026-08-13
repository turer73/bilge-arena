import { z } from 'zod'
import { requireInstitutionPilotRouteContext } from '@/lib/institution-pilot/route-context'
import { institutionPilotNoStoreJson, institutionPilotRpcStatus } from '@/lib/institution-pilot/server-contract'
import {
  isInstitutionStudyProgramEnabled,
  isInstitutionTrackingEnabled,
} from '@/lib/institution-tracking/server-security'
import {
  institutionStudyProgramMutationResultSchema,
  institutionStudyProgramPublishInputSchema,
} from '@/lib/institution-tracking/study-program'
import { teacherClassroomWriteLimiter } from '@/lib/teacher-classroom/rate-limits'

const paramsSchema = z.object({ programRef: z.string().regex(/^[0-9a-f]{32}$/) }).strict()

export async function POST(
  request: Request,
  routeContext: { params: Promise<{ programRef: string }> },
) {
  if (!isInstitutionTrackingEnabled() || !isInstitutionStudyProgramEnabled()) {
    return institutionPilotNoStoreJson({ error: 'Kurum çalışma programı yapılandırılmadı' }, { status: 503 })
  }
  const context = await requireInstitutionPilotRouteContext(request, teacherClassroomWriteLimiter)
  if (!context.ok) return context.response
  const params = paramsSchema.safeParse(await routeContext.params)
  const body = institutionStudyProgramPublishInputSchema.safeParse(await request.json().catch(() => null))
  if (!params.success || !body.success) {
    return institutionPilotNoStoreJson({ error: 'Geçersiz program yayınlama isteği' }, { status: 400 })
  }
  const { data, error } = await context.admin.rpc('publish_institution_study_program', {
    p_user_id: context.userId,
    p_program_ref: params.data.programRef,
    p_request_id: body.data.requestId,
  })
  if (error) {
    return institutionPilotNoStoreJson(
      { error: 'Çalışma programı yayınlanamadı' },
      { status: institutionPilotRpcStatus(error.code) },
    )
  }
  const result = institutionStudyProgramMutationResultSchema.safeParse(data)
  return result.success
    ? institutionPilotNoStoreJson(result.data)
    : institutionPilotNoStoreJson({ error: 'Çalışma programı yayınlanamadı' }, { status: 500 })
}
