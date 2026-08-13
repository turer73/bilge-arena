import { requireInstitutionPilotRouteContext } from '@/lib/institution-pilot/route-context'
import { institutionPilotNoStoreJson, institutionPilotRpcStatus } from '@/lib/institution-pilot/server-contract'
import {
  isInstitutionStudyProgramEnabled,
  isInstitutionTrackingEnabled,
} from '@/lib/institution-tracking/server-security'
import { buildInstitutionStudentLearningAnalysis } from '@/lib/institution-tracking/student-analysis'
import {
  generateInstitutionStudyProgramDraft,
  institutionStudyProgramDraftInputSchema,
  institutionStudyProgramMutationResultSchema,
} from '@/lib/institution-tracking/study-program'
import { teacherClassroomWriteLimiter } from '@/lib/teacher-classroom/rate-limits'

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
  const { data: rawAnalysis, error: analysisError } = await context.admin.rpc(
    'get_institution_student_learning_analysis',
    {
      p_user_id: context.userId,
      p_classroom_id: body.data.classroomId,
      p_member_ref: body.data.memberRef,
      p_game: 'matematik',
      p_exam_ref: 'TYT',
      p_window_end: windowEnd,
    },
  )
  if (analysisError) {
    return institutionPilotNoStoreJson(
      { error: 'Program için öğrenci analizi alınamadı' },
      { status: institutionPilotRpcStatus(analysisError.code) },
    )
  }
  const analysis = buildInstitutionStudentLearningAnalysis(rawAnalysis)
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

  const { data, error } = await context.admin.rpc('create_institution_study_program_draft', {
    p_user_id: context.userId,
    p_classroom_id: body.data.classroomId,
    p_member_ref: body.data.memberRef,
    p_week_start: body.data.weekStart,
    p_daily_minute_limit: body.data.dailyMinuteLimit,
    p_model_version: draft.modelVersion,
    p_items: draft.items,
    p_request_id: body.data.requestId,
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
