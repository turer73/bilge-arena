import { z } from 'zod'
import { requireTeacherClassroomRouteContext } from '@/lib/teacher-classroom/route-context'
import { teacherClassroomWriteLimiter } from '@/lib/teacher-classroom/rate-limits'
import {
  teacherAssignmentPublishInputSchema,
  teacherAssignmentPublishResultSchema,
  teacherClassroomNoStoreJson,
  teacherClassroomRpcStatus,
} from '@/lib/teacher-classroom/server-contract'
import { selectTeacherAssignmentQuestionIds } from '@/lib/teacher-classroom/server-security'

const classroomIdSchema = z.string().uuid()

export async function POST(
  request: Request,
  routeContext: { params: Promise<{ classroomId: string }> },
) {
  const context = await requireTeacherClassroomRouteContext(
    request,
    teacherClassroomWriteLimiter,
    true,
  )
  if (!context.ok) return context.response
  const classroomId = classroomIdSchema.safeParse((await routeContext.params).classroomId)
  const body = teacherAssignmentPublishInputSchema.safeParse(await request.json().catch(() => null))
  if (!classroomId.success || !body.success) {
    return teacherClassroomNoStoreJson({ error: 'Geçersiz ödev isteği' }, { status: 400 })
  }

  let questionQuery = context.admin
    .from('questions')
    .select('id')
    .eq('is_active', true)
    .eq('game', body.data.game)
    .order('id', { ascending: true })
    .limit(1_000)
  questionQuery = body.data.examRef === null
    ? questionQuery.is('exam_ref', null)
    : questionQuery.eq('exam_ref', body.data.examRef)
  if (body.data.category) questionQuery = questionQuery.eq('category', body.data.category)
  if (body.data.topic) questionQuery = questionQuery.eq('topic', body.data.topic)
  if (body.data.difficulty) questionQuery = questionQuery.eq('difficulty', body.data.difficulty)

  const questionResult = await questionQuery
  if (questionResult.error) {
    return teacherClassroomNoStoreJson({ error: 'Ödev soruları seçilemedi' }, { status: 500 })
  }
  const questionIds = selectTeacherAssignmentQuestionIds(questionResult.data, body.data)
  if (!questionIds) {
    const available = Array.isArray(questionResult.data) ? questionResult.data.length : 0
    return teacherClassroomNoStoreJson(
      { error: 'Filtre için yeterli aktif soru yok', available },
      { status: 422 },
    )
  }

  const { data, error } = await context.admin.rpc('publish_teacher_assignment', {
    p_user_id: context.userId,
    p_classroom_id: classroomId.data,
    p_title: body.data.title,
    p_items: questionIds.map((questionId, index) => ({ position: index + 1, questionId })),
    p_available_at: body.data.availableAt,
    p_due_at: body.data.dueAt,
    p_request_id: body.data.requestId,
  })
  if (error) {
    return teacherClassroomNoStoreJson(
      { error: 'Ödev yayımlanamadı' },
      { status: teacherClassroomRpcStatus(error.code) },
    )
  }
  const result = teacherAssignmentPublishResultSchema.safeParse(data)
  return result.success
    && result.data.questionCount === body.data.questionCount
    && Date.parse(result.data.availableAt) === Date.parse(body.data.availableAt)
    && Date.parse(result.data.dueAt) === Date.parse(body.data.dueAt)
    ? teacherClassroomNoStoreJson(result.data)
    : teacherClassroomNoStoreJson({ error: 'Ödev yayımlanamadı' }, { status: 500 })
}
