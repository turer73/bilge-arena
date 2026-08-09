import { requireTeacherClassroomRouteContext } from '@/lib/teacher-classroom/route-context'
import { teacherClassroomReadLimiter } from '@/lib/teacher-classroom/rate-limits'
import {
  studentTeacherMembershipsSchema,
  teacherClassroomNoStoreJson,
  teacherClassroomRpcStatus,
} from '@/lib/teacher-classroom/server-contract'

export async function GET(request: Request) {
  const context = await requireTeacherClassroomRouteContext(request, teacherClassroomReadLimiter)
  if (!context.ok) return context.response
  const { data, error } = await context.admin.rpc('get_my_teacher_classroom_memberships', {
    p_user_id: context.userId,
  })
  if (error) {
    return teacherClassroomNoStoreJson(
      { error: 'Sınıf üyelikleri alınamadı' },
      { status: teacherClassroomRpcStatus(error.code) },
    )
  }
  const result = studentTeacherMembershipsSchema.safeParse(data)
  return result.success
    ? teacherClassroomNoStoreJson(result.data)
    : teacherClassroomNoStoreJson({ error: 'Sınıf üyelikleri alınamadı' }, { status: 500 })
}
