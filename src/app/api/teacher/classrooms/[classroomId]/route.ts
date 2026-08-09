import { z } from 'zod'
import { requireTeacherClassroomRouteContext } from '@/lib/teacher-classroom/route-context'
import { teacherClassroomReadLimiter } from '@/lib/teacher-classroom/rate-limits'
import {
  teacherClassroomNoStoreJson,
  teacherClassroomOverviewSchema,
  teacherClassroomRpcStatus,
} from '@/lib/teacher-classroom/server-contract'

const classroomIdSchema = z.string().uuid()

export async function GET(
  request: Request,
  routeContext: { params: Promise<{ classroomId: string }> },
) {
  const context = await requireTeacherClassroomRouteContext(
    request,
    teacherClassroomReadLimiter,
    true,
  )
  if (!context.ok) return context.response
  const classroomId = classroomIdSchema.safeParse((await routeContext.params).classroomId)
  if (!classroomId.success) {
    return teacherClassroomNoStoreJson({ error: 'Geçersiz sınıf' }, { status: 400 })
  }

  const { data, error } = await context.admin.rpc('get_my_teacher_classroom_overview', {
    p_user_id: context.userId,
    p_classroom_id: classroomId.data,
  })
  if (error) {
    return teacherClassroomNoStoreJson(
      { error: 'Sınıf alınamadı' },
      { status: teacherClassroomRpcStatus(error.code) },
    )
  }
  const result = teacherClassroomOverviewSchema.safeParse(data)
  return result.success
    ? teacherClassroomNoStoreJson(result.data)
    : teacherClassroomNoStoreJson({ error: 'Sınıf alınamadı' }, { status: 500 })
}
