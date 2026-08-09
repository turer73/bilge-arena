import { z } from 'zod'
import { requireTeacherClassroomRouteContext } from '@/lib/teacher-classroom/route-context'
import { teacherClassroomWriteLimiter } from '@/lib/teacher-classroom/rate-limits'
import {
  teacherClassroomNoStoreJson,
  teacherClassroomRpcStatus,
  teacherMembershipEndResultSchema,
  teacherMembershipRequestSchema,
} from '@/lib/teacher-classroom/server-contract'

const classroomIdSchema = z.string().uuid()

export async function POST(
  request: Request,
  routeContext: { params: Promise<{ classroomId: string }> },
) {
  const context = await requireTeacherClassroomRouteContext(request, teacherClassroomWriteLimiter)
  if (!context.ok) return context.response
  const classroomId = classroomIdSchema.safeParse((await routeContext.params).classroomId)
  const body = teacherMembershipRequestSchema.safeParse(await request.json().catch(() => null))
  if (!classroomId.success || !body.success) {
    return teacherClassroomNoStoreJson({ error: 'Geçersiz ayrılma isteği' }, { status: 400 })
  }

  const { data, error } = await context.admin.rpc('withdraw_teacher_classroom_membership', {
    p_user_id: context.userId,
    p_classroom_id: classroomId.data,
    p_request_id: body.data.requestId,
  })
  if (error) {
    return teacherClassroomNoStoreJson(
      { error: 'Paylaşım durdurulamadı' },
      { status: teacherClassroomRpcStatus(error.code) },
    )
  }
  const result = teacherMembershipEndResultSchema.safeParse(data)
  return result.success
    && result.data.classroomId === classroomId.data
    && result.data.membershipStatus === 'withdrawn'
    ? teacherClassroomNoStoreJson(result.data)
    : teacherClassroomNoStoreJson({ error: 'Paylaşım durdurulamadı' }, { status: 500 })
}
