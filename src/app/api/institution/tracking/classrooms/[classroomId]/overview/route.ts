import { z } from 'zod'
import { requireInstitutionPilotRouteContext } from '@/lib/institution-pilot/route-context'
import { institutionPilotNoStoreJson, institutionPilotRpcStatus } from '@/lib/institution-pilot/server-contract'
import { buildInstitutionClassroomOverview } from '@/lib/institution-tracking/classroom-overview'
import { institutionTrackingDirectorySchema } from '@/lib/institution-tracking/directory'
import { isInstitutionTrackingEnabled } from '@/lib/institution-tracking/server-security'
import { buildInstitutionStudentLearningAnalysis } from '@/lib/institution-tracking/student-analysis'

const paramsSchema = z.object({ classroomId: z.string().uuid() }).strict()
const programMembersSchema = z.object({
  memberRefs: z.array(z.string().regex(/^[0-9a-f]{32}$/)).max(40),
}).strict().superRefine((value, context) => {
  if (new Set(value.memberRefs).size !== value.memberRefs.length) {
    context.addIssue({ code: 'custom', message: 'program member refs must be unique' })
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

  const windowEnd = new Date().toISOString()
  try {
    const analyses = await mapWithConcurrency(classroom.students, 4, async (student) => {
      const rpc = await context.admin.rpc('get_institution_student_learning_analysis', {
        p_user_id: context.userId,
        p_classroom_id: classroom.id,
        p_member_ref: student.memberRef,
        p_game: 'matematik',
        p_exam_ref: 'TYT',
        p_window_end: windowEnd,
      })
      if (rpc.error) throw rpc.error
      const analysis = buildInstitutionStudentLearningAnalysis(rpc.data)
      if (!analysis) throw new Error('invalid student analysis')
      return analysis
    })
    const defaultStart = new Date(Date.parse(windowEnd) - 28 * 86_400_000).toISOString()
    const windowStart = analyses.reduce(
      (earliest, analysis) => Date.parse(analysis.scope.windowStart) < Date.parse(earliest)
        ? analysis.scope.windowStart : earliest,
      defaultStart,
    )
    const programsRpc = await context.admin.rpc('get_institution_classroom_published_program_members', {
      p_user_id: context.userId,
      p_classroom_id: classroom.id,
      p_window_start: windowStart,
      p_window_end: windowEnd,
    })
    if (programsRpc.error) throw programsRpc.error
    const programs = programMembersSchema.safeParse(programsRpc.data)
    if (!programs.success) throw new Error('invalid program coverage')
    const overview = buildInstitutionClassroomOverview({
      classroom: {
        id: classroom.id,
        name: classroom.name,
        teacherAlias: classroom.teacherAlias,
        activeStudentCount: classroom.activeStudentCount,
      },
      windowStart,
      windowEnd,
      analyses,
      publishedProgramMemberRefs: programs.data.memberRefs,
    })
    return overview
      ? institutionPilotNoStoreJson(overview)
      : institutionPilotNoStoreJson({ error: 'Sınıf özeti üretilemedi' }, { status: 500 })
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error && typeof error.code === 'string'
      ? error.code : undefined
    return institutionPilotNoStoreJson(
      { error: 'Sınıf özeti eksiksiz alınamadı' },
      { status: code ? institutionPilotRpcStatus(code) : 500 },
    )
  }
}
