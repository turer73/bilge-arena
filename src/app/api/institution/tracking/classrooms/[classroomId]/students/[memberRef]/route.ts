import { z } from 'zod'
import { requireInstitutionPilotRouteContext } from '@/lib/institution-pilot/route-context'
import {
  institutionPilotNoStoreJson,
  institutionPilotRpcStatus,
} from '@/lib/institution-pilot/server-contract'
import { isInstitutionTrackingEnabled } from '@/lib/institution-tracking/server-security'
import {
  buildInstitutionStudentLearningAnalysis,
  completeLegacyInstitutionAnalysisScope,
} from '@/lib/institution-tracking/student-analysis'
import { GAME_SLUGS, type GameSlug } from '@/lib/constants/games'
import { resolveInstitutionLearningScope } from '@/lib/institution-tracking/scope'

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
  const gameRaw = url.searchParams.get('game') ?? 'matematik'
  const examRefRaw = url.searchParams.get('exam_ref') ?? 'TYT'
  if (
    !GAME_SLUGS.some((candidate) => candidate === gameRaw)
    || !/^[A-Z0-9-]{2,10}$/.test(examRefRaw)
  ) {
    return institutionPilotNoStoreJson({ error: 'Geçersiz ders kapsamı' }, { status: 400 })
  }
  const game = gameRaw as GameSlug
  const examRef = examRefRaw
  const scopeResolution = await resolveInstitutionLearningScope(
    (name, args) => context.admin.rpc(name, args),
    game,
    examRef,
  )
  if (scopeResolution.error || !scopeResolution.scope) {
    return institutionPilotNoStoreJson(
      { error: 'Bu kapsam henüz güvenilir analiz için desteklenmiyor' },
      { status: scopeResolution.error && scopeResolution.code
        ? institutionPilotRpcStatus(scopeResolution.code) : 400 },
    )
  }

  const windowEnd = new Date().toISOString()
  const { data, error } = scopeResolution.legacy
    ? await context.admin.rpc('get_institution_student_learning_analysis', {
        p_user_id: context.userId,
        p_classroom_id: params.data.classroomId,
        p_member_ref: params.data.memberRef,
        p_game: game,
        p_exam_ref: examRef,
        p_window_end: windowEnd,
      })
    : await context.admin.rpc('get_institution_student_learning_analysis_v2', {
        p_user_id: context.userId,
        p_classroom_id: params.data.classroomId,
        p_member_ref: params.data.memberRef,
        p_game: game,
        p_display_exam_ref: examRef,
        p_window_end: windowEnd,
      })
  if (error) {
    return institutionPilotNoStoreJson(
      { error: 'Öğrenci öğrenme analizi alınamadı' },
      { status: institutionPilotRpcStatus(error.code) },
    )
  }

  const result = buildInstitutionStudentLearningAnalysis(
    scopeResolution.legacy
      ? completeLegacyInstitutionAnalysisScope(data, scopeResolution.scope)
      : data,
  )
  if (result && (
    result.scope.game !== scopeResolution.scope.game
    || result.scope.examRef !== scopeResolution.scope.displayExamRef
    || result.scope.questionExamRef !== scopeResolution.scope.questionExamRef
    || result.scope.taxonomyVersion !== scopeResolution.scope.taxonomyVersion
    || result.scope.scopePolicyVersion !== scopeResolution.scope.scopePolicyVersion
  )) {
    return institutionPilotNoStoreJson(
      { error: 'Öğrenci öğrenme analizi kapsamı doğrulanamadı' },
      { status: 500 },
    )
  }
  return result
    ? institutionPilotNoStoreJson(result)
    : institutionPilotNoStoreJson(
      { error: 'Öğrenci öğrenme analizi alınamadı' },
      { status: 500 },
    )
}
