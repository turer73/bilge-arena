import { requireTeacherClassroomRouteContext } from '@/lib/teacher-classroom/route-context'
import { teacherClassroomReadLimiter } from '@/lib/teacher-classroom/rate-limits'
import {
  studentTeacherAssignmentsSchema,
  teacherClassroomNoStoreJson,
  teacherClassroomRpcStatus,
} from '@/lib/teacher-classroom/server-contract'

export async function GET(request: Request) {
  const context = await requireTeacherClassroomRouteContext(request, teacherClassroomReadLimiter)
  if (!context.ok) return context.response
  const { data, error } = await context.admin.rpc('get_my_teacher_assignments', {
    p_user_id: context.userId,
  })
  if (error) {
    return teacherClassroomNoStoreJson(
      { error: 'Ödevler alınamadı' },
      { status: teacherClassroomRpcStatus(error.code) },
    )
  }
  const result = studentTeacherAssignmentsSchema.safeParse(data)
  return result.success
    ? teacherClassroomNoStoreJson(result.data)
    : teacherClassroomNoStoreJson({ error: 'Ödevler alınamadı' }, { status: 500 })
}
