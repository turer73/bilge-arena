import { requireInstitutionPilotRouteContext } from '@/lib/institution-pilot/route-context'
import { institutionPilotNoStoreJson, institutionPilotRpcStatus } from '@/lib/institution-pilot/server-contract'
import {
  isInstitutionStudyProgramEnabled,
  isInstitutionTrackingEnabled,
} from '@/lib/institution-tracking/server-security'
import {
  buildInstitutionStudentLearningAnalysis,
  completeLegacyInstitutionAnalysisScope,
  withInstitutionDiagnosticSources,
} from '@/lib/institution-tracking/student-analysis'
import {
  generateInstitutionStudyProgramDraft,
  institutionStudyProgramDraftInputSchema,
  institutionStudyProgramMutationResultSchema,
} from '@/lib/institution-tracking/study-program'
import { teacherClassroomWriteLimiter } from '@/lib/teacher-classroom/rate-limits'
import { resolveInstitutionLearningScope } from '@/lib/institution-tracking/scope'

function isAppFirstDiagnosticRpcUnavailable(error: { code?: string } | null) {
  return error?.code === 'PGRST202' || error?.code === '42883'
}

export async function POST(request: Request) {
  if (!isInstitutionTrackingEnabled() || !isInstitutionStudyProgramEnabled()) {
    return institutionPilotNoStoreJson({ error: 'Kurum çalışma programı yapılandırılmadı' }, { status: 503 })
  }
  const context = await requireInstitutionPilotRouteContext(request, teacherClassroomWriteLimiter)
  if (!context.ok) return context.response
  const body = institutionStudyProgramDraftInputSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) {
    return institutionPilotNoStoreJson({ error: 'Geçersiz çalışma programı taslağı' }, { status: 400 })
  }

  const windowEnd = new Date().toISOString()
  const scopeResolution = await resolveInstitutionLearningScope(
    (name, args) => context.admin.rpc(name, args),
    body.data.game,
    body.data.examRef,
  )
  if (scopeResolution.error || !scopeResolution.scope) {
    return institutionPilotNoStoreJson(
      { error: 'Program kapsamı henüz güvenilir biçimde yayımlanmadı' },
      { status: scopeResolution.error && scopeResolution.code
        ? institutionPilotRpcStatus(scopeResolution.code) : 409 },
    )
  }
  const { data: rawAnalysis, error: analysisError } = scopeResolution.legacy
    ? await context.admin.rpc('get_institution_student_learning_analysis', {
        p_user_id: context.userId,
        p_classroom_id: body.data.classroomId,
        p_member_ref: body.data.memberRef,
        p_game: body.data.game,
        p_exam_ref: body.data.examRef,
        p_window_end: windowEnd,
      })
    : await context.admin.rpc('get_institution_student_learning_analysis_v2', {
        p_user_id: context.userId,
        p_classroom_id: body.data.classroomId,
        p_member_ref: body.data.memberRef,
        p_game: body.data.game,
        p_display_exam_ref: body.data.examRef,
        p_window_end: windowEnd,
      })
  if (analysisError) {
    return institutionPilotNoStoreJson(
      { error: 'Program için öğrenci analizi alınamadı' },
      { status: institutionPilotRpcStatus(analysisError.code) },
    )
  }
  const diagnosticRpc = await context.admin.rpc(
    'get_institution_student_diagnostic_sources',
    {
      p_user_id: context.userId,
      p_classroom_id: body.data.classroomId,
      p_member_ref: body.data.memberRef,
      p_game: body.data.game,
      p_display_exam_ref: body.data.examRef,
      p_window_end: windowEnd,
    },
  )
  if (diagnosticRpc.error && !isAppFirstDiagnosticRpcUnavailable(diagnosticRpc.error)) {
    return institutionPilotNoStoreJson(
      { error: 'Program için tanılama kanıtı alınamadı' },
      { status: institutionPilotRpcStatus(diagnosticRpc.error.code) },
    )
  }
  const scopedAnalysis = scopeResolution.legacy
    ? completeLegacyInstitutionAnalysisScope(rawAnalysis, scopeResolution.scope)
    : rawAnalysis
  const analysis = buildInstitutionStudentLearningAnalysis(
    withInstitutionDiagnosticSources(scopedAnalysis, diagnosticRpc.error ? { sources: [] } : diagnosticRpc.data),
  )
  const draft = analysis && generateInstitutionStudyProgramDraft(analysis, {
    weekStart: body.data.weekStart,
    dailyMinuteLimit: body.data.dailyMinuteLimit,
    generatedAt: windowEnd,
  })
  if (!draft) {
    return institutionPilotNoStoreJson(
      { error: 'Güvenilir program taslağı üretmek için yeterli kapsam yok' },
      { status: 409 },
    )
  }

  const mutationArgs = {
    p_user_id: context.userId,
    p_classroom_id: body.data.classroomId,
    p_member_ref: body.data.memberRef,
    p_week_start: body.data.weekStart,
    p_daily_minute_limit: body.data.dailyMinuteLimit,
    p_model_version: draft.modelVersion,
    p_items: draft.items,
    p_request_id: body.data.requestId,
  }
  const { data, error } = scopeResolution.legacy
    ? await context.admin.rpc('create_institution_study_program_draft', mutationArgs)
    : await context.admin.rpc('create_institution_study_program_draft_v2', {
        ...mutationArgs,
        p_game: body.data.game,
        p_display_exam_ref: body.data.examRef,
      })
  if (error) {
    return institutionPilotNoStoreJson(
      { error: 'Çalışma programı taslağı kaydedilemedi' },
      { status: institutionPilotRpcStatus(error.code) },
    )
  }
  const result = institutionStudyProgramMutationResultSchema.safeParse(data)
  return result.success
    ? institutionPilotNoStoreJson({ program: result.data, draft })
    : institutionPilotNoStoreJson({ error: 'Çalışma programı taslağı kaydedilemedi' }, { status: 500 })
}
