import { z } from 'zod'
import { requireInstitutionPilotRouteContext } from '@/lib/institution-pilot/route-context'
import { institutionPilotNoStoreJson, institutionPilotRpcStatus } from '@/lib/institution-pilot/server-contract'
import { buildInstitutionClassroomOverview } from '@/lib/institution-tracking/classroom-overview'
import { institutionTrackingDirectorySchema } from '@/lib/institution-tracking/directory'
import { isInstitutionTrackingEnabled } from '@/lib/institution-tracking/server-security'
import {
  buildInstitutionStudentLearningAnalysis,
  completeLegacyInstitutionAnalysisScope,
} from '@/lib/institution-tracking/student-analysis'
import {
  institutionFollowupMetricsSchema,
  institutionFollowupMetricsV2Schema,
} from '@/lib/institution-tracking/followup'
import {
  institutionGrowthMetricsSchema,
  institutionGrowthMetricsV2RpcSchema,
  institutionGrowthUnavailableV2RpcSchema,
} from '@/lib/institution-tracking/growth'
import { GAME_SLUGS, type GameSlug } from '@/lib/constants/games'
import {
  institutionScopeIdentitySchema,
  isExactInstitutionScopeIdentity,
  resolveInstitutionLearningScope,
} from '@/lib/institution-tracking/scope'

const paramsSchema = z.object({ classroomId: z.string().uuid() }).strict()
const programMembersSchema = z.object({
  memberRefs: z.array(z.string().regex(/^[0-9a-f]{32}$/)).max(40),
}).strict().superRefine((value, context) => {
  if (new Set(value.memberRefs).size !== value.memberRefs.length) {
    context.addIssue({ code: 'custom', message: 'program member refs must be unique' })
  }
})
const programMembersV2Schema = z.object({
  scope: institutionScopeIdentitySchema,
  memberRefs: z.array(z.string().regex(/^[0-9a-f]{32}$/)).max(40),
}).strict().superRefine((value, context) => {
  if (new Set(value.memberRefs).size !== value.memberRefs.length) {
    context.addIssue({ code: 'custom', message: 'duplicate program member ref' })
  }
})

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length)
  let cursor = 0
  async function run() {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(values[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, run))
  return results
}

export async function GET(
  request: Request,
  routeContext: { params: Promise<{ classroomId: string }> },
) {
  if (!isInstitutionTrackingEnabled()) {
    return institutionPilotNoStoreJson({ error: 'Kurum takip sistemi yapılandırılmadı' }, { status: 503 })
  }
  const context = await requireInstitutionPilotRouteContext(request)
  if (!context.ok) return context.response
  const params = paramsSchema.safeParse(await routeContext.params)
  if (!params.success) {
    return institutionPilotNoStoreJson({ error: 'Geçersiz sınıf kapsamı' }, { status: 400 })
  }
  const url = new URL(request.url)
  const gameRaw = url.searchParams.get('game') ?? 'matematik'
  const examRef = url.searchParams.get('exam_ref') ?? 'TYT'
  if (
    !GAME_SLUGS.some((candidate) => candidate === gameRaw)
    || !/^[A-Z0-9-]{2,10}$/.test(examRef)
  ) {
    return institutionPilotNoStoreJson({ error: 'Geçersiz ders kapsamı' }, { status: 400 })
  }
  const game = gameRaw as GameSlug

  const directoryRpc = await context.admin.rpc('get_institution_tracking_directory', { p_user_id: context.userId })
  if (directoryRpc.error) {
    return institutionPilotNoStoreJson({ error: 'Sınıf roster bilgisi alınamadı' }, { status: institutionPilotRpcStatus(directoryRpc.error.code) })
  }
  const directory = institutionTrackingDirectorySchema.safeParse(directoryRpc.data)
  if (!directory.success) {
    return institutionPilotNoStoreJson({ error: 'Sınıf roster bilgisi alınamadı' }, { status: 500 })
  }
  const classroom = directory.data.classrooms.find((item) => item.id === params.data.classroomId)
  if (!classroom) {
    return institutionPilotNoStoreJson({ error: 'Aktif sınıf bulunamadı' }, { status: 404 })
  }
  // Classroom aggregates are decision-support data, not a shortcut to expose
  // individual student evidence. Refuse the aggregate before any student RPC
  // is evaluated when the privacy cohort is smaller than three.
  if (classroom.activeStudentCount < 3 || classroom.students.length < 3) {
    return institutionPilotNoStoreJson(
      {
        error: 'Toplu analiz için yeterli grup yok',
        supported: false,
        reason: 'insufficient_group',
        minimumGroupSize: 3,
      },
      { status: 422 },
    )
  }

  const scopeResolution = await resolveInstitutionLearningScope(
    (name, args) => context.admin.rpc(name, args),
    game,
    examRef,
  )
  if (scopeResolution.error || !scopeResolution.scope) {
    return institutionPilotNoStoreJson(
      { error: 'Kurum öğrenme kapsamı kullanıma hazır değil' },
      { status: scopeResolution.error && scopeResolution.code
        ? institutionPilotRpcStatus(scopeResolution.code) : 503 },
    )
  }
  const releasedScope = scopeResolution.scope

  const windowEnd = new Date().toISOString()
  try {
    const analyses = await mapWithConcurrency(classroom.students, 4, async (student) => {
      const rpc = scopeResolution.legacy
        ? await context.admin.rpc('get_institution_student_learning_analysis', {
            p_user_id: context.userId,
            p_classroom_id: classroom.id,
            p_member_ref: student.memberRef,
            p_game: game,
            p_exam_ref: examRef,
            p_window_end: windowEnd,
          })
        : await context.admin.rpc('get_institution_student_learning_analysis_v2', {
            p_user_id: context.userId,
            p_classroom_id: classroom.id,
            p_member_ref: student.memberRef,
            p_game: game,
            p_display_exam_ref: examRef,
            p_window_end: windowEnd,
          })
      if (rpc.error) throw rpc.error
      const analysis = buildInstitutionStudentLearningAnalysis(
        scopeResolution.legacy
          ? completeLegacyInstitutionAnalysisScope(rpc.data, releasedScope)
          : rpc.data,
      )
      if (!analysis) throw new Error('invalid student analysis')
      return analysis
    })
    const defaultStart = new Date(Date.parse(windowEnd) - 28 * 86_400_000).toISOString()
    const windowStart = analyses.reduce(
      (earliest, analysis) => Date.parse(analysis.scope.windowStart) < Date.parse(earliest)
        ? analysis.scope.windowStart : earliest,
      defaultStart,
    )
    const programsRpc = scopeResolution.legacy
      ? await context.admin.rpc('get_institution_classroom_published_program_members', {
          p_user_id: context.userId,
          p_classroom_id: classroom.id,
          p_window_start: windowStart,
          p_window_end: windowEnd,
        })
      : await context.admin.rpc('get_institution_classroom_published_program_members_v2', {
          p_user_id: context.userId,
          p_classroom_id: classroom.id,
          p_game: game,
          p_display_exam_ref: examRef,
          p_window_start: windowStart,
          p_window_end: windowEnd,
        })
    if (programsRpc.error) throw programsRpc.error
    let publishedProgramMemberRefs: string[]
    if (scopeResolution.legacy) {
      const programs = programMembersSchema.safeParse(programsRpc.data)
      if (!programs.success) throw new Error('invalid program coverage')
      publishedProgramMemberRefs = programs.data.memberRefs
    } else {
      const programs = programMembersV2Schema.safeParse(programsRpc.data)
      if (!programs.success) throw new Error('invalid program coverage')
      if (!isExactInstitutionScopeIdentity(programs.data.scope, releasedScope)) {
        throw new Error('program coverage scope mismatch')
      }
      publishedProgramMemberRefs = programs.data.memberRefs
    }
    const followupsRpc = scopeResolution.legacy
      ? await context.admin.rpc('get_institution_classroom_followup_metrics', {
          p_user_id: context.userId,
          p_classroom_id: classroom.id,
          p_window_start: windowStart,
          p_window_end: windowEnd,
        })
      : await context.admin.rpc('get_institution_classroom_followup_metrics_v2', {
          p_user_id: context.userId,
          p_classroom_id: classroom.id,
          p_game: game,
          p_display_exam_ref: examRef,
          p_window_start: windowStart,
          p_window_end: windowEnd,
        })
    if (followupsRpc.error) throw followupsRpc.error
    let scopedFollowupMetrics: z.infer<typeof institutionFollowupMetricsSchema>
    if (scopeResolution.legacy) {
      const followupMetrics = institutionFollowupMetricsSchema.safeParse(followupsRpc.data)
      if (!followupMetrics.success) throw new Error('invalid follow-up metrics')
      scopedFollowupMetrics = followupMetrics.data
    } else {
      const followupMetrics = institutionFollowupMetricsV2Schema.safeParse(followupsRpc.data)
      if (!followupMetrics.success) throw new Error('invalid follow-up metrics')
      if (!isExactInstitutionScopeIdentity(followupMetrics.data.scope, releasedScope)) {
        throw new Error('follow-up metrics scope mismatch')
      }
      const { scope: _scope, ...metrics } = followupMetrics.data
      scopedFollowupMetrics = metrics
    }
    const growthRpc = scopeResolution.legacy
      ? await context.admin.rpc('get_institution_classroom_growth_metrics', {
          p_user_id: context.userId,
          p_classroom_id: classroom.id,
          p_window_end: windowEnd,
          p_taxonomy_version: releasedScope.taxonomyVersion,
        })
      : await context.admin.rpc('get_institution_classroom_growth_metrics_v2', {
          p_user_id: context.userId,
          p_classroom_id: classroom.id,
          p_game: game,
          p_display_exam_ref: examRef,
          p_window_end: windowEnd,
        })
    if (growthRpc.error) throw growthRpc.error
    const legacyGrowth = scopeResolution.legacy
      ? institutionGrowthMetricsSchema.safeParse(growthRpc.data)
      : null
    const currentGrowth = scopeResolution.legacy
      ? null
      : institutionGrowthMetricsV2RpcSchema.safeParse(growthRpc.data)
    if (!scopeResolution.legacy) {
      const unavailable = institutionGrowthUnavailableV2RpcSchema.safeParse(growthRpc.data)
      if (unavailable.success) {
        return institutionPilotNoStoreJson(
          {
            error: 'Toplu analiz için yeterli grup yok',
            supported: false,
            reason: unavailable.data.reason,
            minimumGroupSize: 3,
          },
          { status: 422 },
        )
      }
    }
    if ((scopeResolution.legacy && !legacyGrowth?.success)
      || (!scopeResolution.legacy && !currentGrowth?.success)) {
      throw new Error('invalid growth metrics')
    }
    if (currentGrowth?.success
      && !isExactInstitutionScopeIdentity(currentGrowth.data.scope, releasedScope)) {
      throw new Error('growth metrics scope mismatch')
    }
    const growthMetrics = legacyGrowth?.success
      ? legacyGrowth.data
      : currentGrowth?.success
        ? (({ supported: _supported, scope: _scope, ...metrics }) => metrics)(currentGrowth.data)
        : null
    if (!growthMetrics) throw new Error('invalid growth metrics')
    const overview = buildInstitutionClassroomOverview({
      classroom: {
        id: classroom.id,
        name: classroom.name,
        teacherAlias: classroom.teacherAlias,
        activeStudentCount: classroom.activeStudentCount,
      },
      windowStart,
      windowEnd,
      taxonomyVersion: releasedScope.taxonomyVersion,
      analyses,
      publishedProgramMemberRefs,
      followupMetrics: scopedFollowupMetrics,
      growthMetrics,
    })
    if (!overview) {
      return institutionPilotNoStoreJson({ error: 'Sınıf özeti üretilemedi' }, { status: 500 })
    }
    if (
      overview.scope.game !== releasedScope.game
      || overview.scope.examRef !== releasedScope.displayExamRef
      || overview.scope.questionExamRef !== releasedScope.questionExamRef
      || overview.scope.taxonomyVersion !== releasedScope.taxonomyVersion
      || overview.scope.scopePolicyVersion !== releasedScope.scopePolicyVersion
    ) {
      return institutionPilotNoStoreJson({ error: 'Sınıf özeti kapsamı doğrulanamadı' }, { status: 500 })
    }
    if (directory.data.membership.role !== 'manager') {
      const { teacherIndicators: _managerOnly, ...classroomOverview } = overview
      return institutionPilotNoStoreJson(classroomOverview)
    }
    return institutionPilotNoStoreJson(overview)
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error && typeof error.code === 'string'
      ? error.code : undefined
    return institutionPilotNoStoreJson(
      { error: 'Sınıf özeti eksiksiz alınamadı' },
      { status: code ? institutionPilotRpcStatus(code) : 500 },
    )
  }
}
