import { z } from 'zod'
import { requireTeacherClassroomRouteContext } from '@/lib/teacher-classroom/route-context'
import { teacherClassroomWriteLimiter } from '@/lib/teacher-classroom/rate-limits'
import {
  teacherClassroomNoStoreJson,
  teacherClassroomRpcStatus,
  teacherInviteIssueInputSchema,
  teacherInviteIssueResponseSchema,
  teacherInviteIssueRpcResultSchema,
} from '@/lib/teacher-classroom/server-contract'
import {
  deriveTeacherInviteToken,
  digestTeacherInviteToken,
  teacherInviteSharePath,
} from '@/lib/teacher-classroom/server-security'

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
  const body = teacherInviteIssueInputSchema.safeParse(await request.json().catch(() => null))
  if (!classroomId.success || !body.success) {
    return teacherClassroomNoStoreJson({ error: 'Geçersiz davet isteği' }, { status: 400 })
  }

  const token = deriveTeacherInviteToken({
    secret: context.config.inviteSecret,
    teacherId: context.userId,
    classroomId: classroomId.data,
    requestId: body.data.requestId,
  })
  const { data, error } = await context.admin.rpc('issue_teacher_classroom_invite', {
    p_user_id: context.userId,
    p_classroom_id: classroomId.data,
    p_token_digest: digestTeacherInviteToken(token),
    p_expires_at: body.data.expiresAt,
    p_max_uses: body.data.maxUses,
    p_request_id: body.data.requestId,
  })
  if (error) {
    return teacherClassroomNoStoreJson(
      { error: 'Davet oluşturulamadı' },
      { status: teacherClassroomRpcStatus(error.code) },
    )
  }
  const result = teacherInviteIssueRpcResultSchema.safeParse(data)
  if (!result.success
    || result.data.maxUses !== body.data.maxUses
    || Date.parse(result.data.expiresAt) !== Date.parse(body.data.expiresAt)) {
    return teacherClassroomNoStoreJson({ error: 'Davet oluşturulamadı' }, { status: 500 })
  }
  const response = teacherInviteIssueResponseSchema.safeParse({
    ...result.data,
    token,
    sharePath: teacherInviteSharePath(token),
  })
  return response.success
    ? teacherClassroomNoStoreJson(response.data)
    : teacherClassroomNoStoreJson({ error: 'Davet oluşturulamadı' }, { status: 500 })
}
