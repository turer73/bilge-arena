import { requireTeacherClassroomRouteContext } from '@/lib/teacher-classroom/route-context'
import {
  teacherClassroomCreateInputSchema,
  teacherClassroomCreateResultSchema,
  teacherClassroomListSchema,
  teacherClassroomNoStoreJson,
  teacherClassroomRpcStatus,
} from '@/lib/teacher-classroom/server-contract'
import {
  teacherClassroomReadLimiter,
  teacherClassroomWriteLimiter,
} from '@/lib/teacher-classroom/rate-limits'

export async function GET(request: Request) {
  const context = await requireTeacherClassroomRouteContext(
    request,
    teacherClassroomReadLimiter,
    true,
  )
  if (!context.ok) return context.response

  const { data, error } = await context.admin.rpc('get_my_teacher_classrooms', {
    p_user_id: context.userId,
  })
  if (error) {
    return teacherClassroomNoStoreJson(
      { error: 'Sınıflar alınamadı' },
      { status: teacherClassroomRpcStatus(error.code) },
    )
  }
  const result = teacherClassroomListSchema.safeParse(data)
  return result.success
    ? teacherClassroomNoStoreJson(result.data)
    : teacherClassroomNoStoreJson({ error: 'Sınıflar alınamadı' }, { status: 500 })
}

export async function POST(request: Request) {
  const context = await requireTeacherClassroomRouteContext(
    request,
    teacherClassroomWriteLimiter,
    true,
  )
  if (!context.ok) return context.response

  const body = teacherClassroomCreateInputSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) {
    return teacherClassroomNoStoreJson({ error: 'Geçersiz sınıf isteği' }, { status: 400 })
  }
  const { data, error } = await context.admin.rpc('create_teacher_classroom', {
    p_user_id: context.userId,
    p_name: body.data.name,
    p_request_id: body.data.requestId,
  })
  if (error) {
    return teacherClassroomNoStoreJson(
      { error: 'Sınıf oluşturulamadı' },
      { status: teacherClassroomRpcStatus(error.code) },
    )
  }
  const result = teacherClassroomCreateResultSchema.safeParse(data)
  return result.success
    ? teacherClassroomNoStoreJson(result.data)
    : teacherClassroomNoStoreJson({ error: 'Sınıf oluşturulamadı' }, { status: 500 })
}
