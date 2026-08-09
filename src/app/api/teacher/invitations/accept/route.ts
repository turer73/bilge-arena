import { requireTeacherClassroomRouteContext } from '@/lib/teacher-classroom/route-context'
import { teacherInviteAcceptLimiter } from '@/lib/teacher-classroom/rate-limits'
import {
  teacherClassroomNoStoreJson,
  teacherInvitationAcceptInputSchema,
  teacherInvitationAcceptResultSchema,
  teacherInviteRpcStatus,
} from '@/lib/teacher-classroom/server-contract'
import {
  digestTeacherInviteToken,
  legalVersionsMatch,
} from '@/lib/teacher-classroom/server-security'

export async function POST(request: Request) {
  const context = await requireTeacherClassroomRouteContext(request, teacherInviteAcceptLimiter)
  if (!context.ok) return context.response
  const body = teacherInvitationAcceptInputSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) {
    return teacherClassroomNoStoreJson({ error: 'Geçersiz davet kabulü' }, { status: 400 })
  }
  if (!legalVersionsMatch(context.config, body.data)) {
    return teacherClassroomNoStoreJson(
      { error: 'Bilgilendirme metinleri güncellendi; yeniden inceleyin' },
      { status: 409 },
    )
  }

  const { data, error } = await context.admin.rpc('accept_teacher_classroom_invite', {
    p_user_id: context.userId,
    p_token_digest: digestTeacherInviteToken(body.data.token),
    p_notice_version: body.data.noticeVersion,
    p_consent_version: body.data.sharingConsentVersion,
    p_request_id: body.data.requestId,
  })
  if (error) {
    return teacherClassroomNoStoreJson(
      { error: 'Davet kabul edilemedi' },
      { status: teacherInviteRpcStatus(error.code) },
    )
  }
  const result = teacherInvitationAcceptResultSchema.safeParse(data)
  return result.success
    ? teacherClassroomNoStoreJson(result.data)
    : teacherClassroomNoStoreJson({ error: 'Davet kabul edilemedi' }, { status: 500 })
}
