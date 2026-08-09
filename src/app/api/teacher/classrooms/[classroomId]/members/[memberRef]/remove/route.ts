import { z } from 'zod'
import { requireTeacherClassroomRouteContext } from '@/lib/teacher-classroom/route-context'
import { teacherClassroomWriteLimiter } from '@/lib/teacher-classroom/rate-limits'
import {
  teacherClassroomNoStoreJson,
  teacherClassroomRpcStatus,
  teacherMemberRemoveResultSchema,
  teacherMembershipRequestSchema,
} from '@/lib/teacher-classroom/server-contract'

const paramsSchema = z.object({
  classroomId: z.string().uuid(),
  memberRef: z.string().regex(/^[0-9a-f]{32}$/),
}).strict()

export async function POST(
  request: Request,
  routeContext: { params: Promise<{ classroomId: string; memberRef: string }> },
) {
  const context = await requireTeacherClassroomRouteContext(
    request,
    teacherClassroomWriteLimiter,
    true,
  )
  if (!context.ok) return context.response
  const params = paramsSchema.safeParse(await routeContext.params)
  const body = teacherMembershipRequestSchema.safeParse(await request.json().catch(() => null))
  if (!params.success || !body.success) {
    return teacherClassroomNoStoreJson({ error: 'Geçersiz öğrenci çıkarma isteği' }, { status: 400 })
  }

  const { data, error } = await context.admin.rpc('remove_teacher_classroom_member', {
    p_user_id: context.userId,
    p_classroom_id: params.data.classroomId,
    p_member_ref: params.data.memberRef,
    p_request_id: body.data.requestId,
  })
  if (error) {
    return teacherClassroomNoStoreJson(
      { error: 'Öğrenci çıkarılamadı' },
      { status: teacherClassroomRpcStatus(error.code) },
    )
  }
  const result = teacherMemberRemoveResultSchema.safeParse(data)
  return result.success
    && result.data.classroomId === params.data.classroomId
    && result.data.memberRef === params.data.memberRef
    && result.data.membershipStatus === 'removed'
    ? teacherClassroomNoStoreJson(result.data)
    : teacherClassroomNoStoreJson({ error: 'Öğrenci çıkarılamadı' }, { status: 500 })
}
