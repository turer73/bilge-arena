import { z } from 'zod'
import { requireTeacherClassroomRouteContext } from '@/lib/teacher-classroom/route-context'
import { teacherClassroomWriteLimiter } from '@/lib/teacher-classroom/rate-limits'
import {
  teacherClassroomNoStoreJson,
  teacherClassroomRpcStatus,
  teacherInviteRevokeInputSchema,
  teacherInviteRevokeResultSchema,
} from '@/lib/teacher-classroom/server-contract'

const inviteRefSchema = z.string().regex(/^[0-9a-f]{32}$/)

export async function POST(
  request: Request,
  routeContext: { params: Promise<{ inviteRef: string }> },
) {
  const context = await requireTeacherClassroomRouteContext(
    request,
    teacherClassroomWriteLimiter,
    true,
  )
  if (!context.ok) return context.response
  const inviteRef = inviteRefSchema.safeParse((await routeContext.params).inviteRef)
  const body = teacherInviteRevokeInputSchema.safeParse(await request.json().catch(() => null))
  if (!inviteRef.success || !body.success) {
    return teacherClassroomNoStoreJson({ error: 'Geçersiz davet iptali' }, { status: 400 })
  }

  const { data, error } = await context.admin.rpc('revoke_teacher_classroom_invite', {
    p_user_id: context.userId,
    p_invite_ref: inviteRef.data,
    p_request_id: body.data.requestId,
  })
  if (error) {
    return teacherClassroomNoStoreJson(
      { error: 'Davet iptal edilemedi' },
      { status: teacherClassroomRpcStatus(error.code) },
    )
  }
  const result = teacherInviteRevokeResultSchema.safeParse(data)
  return result.success && result.data.inviteRef === inviteRef.data
    ? teacherClassroomNoStoreJson(result.data)
    : teacherClassroomNoStoreJson({ error: 'Davet iptal edilemedi' }, { status: 500 })
}
