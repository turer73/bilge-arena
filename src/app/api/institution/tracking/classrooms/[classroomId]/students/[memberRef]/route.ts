import { z } from 'zod'
import { requireInstitutionPilotRouteContext } from '@/lib/institution-pilot/route-context'
import {
  institutionPilotNoStoreJson,
  institutionPilotRpcStatus,
} from '@/lib/institution-pilot/server-contract'
import { isInstitutionTrackingEnabled } from '@/lib/institution-tracking/server-security'
import { buildInstitutionStudentLearningAnalysis } from '@/lib/institution-tracking/student-analysis'

const paramsSchema = z.object({
  classroomId: z.string().uuid(),
  memberRef: z.string().regex(/^[0-9a-f]{32}$/),
}).strict()

export async function GET(
  request: Request,
  routeContext: { params: Promise<{ classroomId: string; memberRef: string }> },
) {
  if (!isInstitutionTrackingEnabled()) {
    return institutionPilotNoStoreJson(
      { error: 'Kurum takip sistemi yapılandırılmadı' },
      { status: 503 },
    )
  }

  const context = await requireInstitutionPilotRouteContext(request)
  if (!context.ok) return context.response
  const params = paramsSchema.safeParse(await routeContext.params)
  if (!params.success) {
    return institutionPilotNoStoreJson({ error: 'Geçersiz öğrenci kapsamı' }, { status: 400 })
  }

  const url = new URL(request.url)
  const game = url.searchParams.get('game') ?? 'matematik'
  const examRef = url.searchParams.get('exam_ref') ?? 'TYT'
  if (game !== 'matematik' || examRef !== 'TYT') {
    return institutionPilotNoStoreJson(
      { error: 'Bu kapsam henüz güvenilir analiz için desteklenmiyor' },
      { status: 400 },
    )
  }

  const windowEnd = new Date().toISOString()
  const { data, error } = await context.admin.rpc('get_institution_student_learning_analysis', {
    p_user_id: context.userId,
    p_classroom_id: params.data.classroomId,
    p_member_ref: params.data.memberRef,
    p_game: game,
    p_exam_ref: examRef,
    p_window_end: windowEnd,
  })
  if (error) {
    return institutionPilotNoStoreJson(
      { error: 'Öğrenci öğrenme analizi alınamadı' },
      { status: institutionPilotRpcStatus(error.code) },
    )
  }

  const result = buildInstitutionStudentLearningAnalysis(data)
  return result
    ? institutionPilotNoStoreJson(result)
    : institutionPilotNoStoreJson(
      { error: 'Öğrenci öğrenme analizi alınamadı' },
      { status: 500 },
    )
}
