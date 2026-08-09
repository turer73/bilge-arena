import { requireTeacherClassroomRouteContext } from '@/lib/teacher-classroom/route-context'
import { teacherInvitePreviewLimiter } from '@/lib/teacher-classroom/rate-limits'
import {
  teacherClassroomNoStoreJson,
  teacherInvitationPreviewInputSchema,
  teacherInvitationPreviewResponseSchema,
  teacherInvitationPreviewRpcSchema,
  teacherInviteRpcStatus,
} from '@/lib/teacher-classroom/server-contract'
import { digestTeacherInviteToken } from '@/lib/teacher-classroom/server-security'

export async function POST(request: Request) {
  const context = await requireTeacherClassroomRouteContext(request, teacherInvitePreviewLimiter)
  if (!context.ok) return context.response
  const body = teacherInvitationPreviewInputSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) {
    return teacherClassroomNoStoreJson({ error: 'Geçersiz davet' }, { status: 400 })
  }

  const { data, error } = await context.admin.rpc('preview_teacher_classroom_invite', {
    p_user_id: context.userId,
    p_token_digest: digestTeacherInviteToken(body.data.token),
  })
  if (error) {
    return teacherClassroomNoStoreJson(
      { error: 'Davet kullanılamıyor' },
      { status: teacherInviteRpcStatus(error.code) },
    )
  }
  const preview = teacherInvitationPreviewRpcSchema.safeParse(data)
  if (!preview.success) {
    return teacherClassroomNoStoreJson({ error: 'Davet kullanılamıyor' }, { status: 500 })
  }
  const result = teacherInvitationPreviewResponseSchema.safeParse({
    ...preview.data,
    notice: {
      version: context.config.noticeVersion,
      href: context.config.noticeHref,
    },
    sharingConsent: {
      version: context.config.sharingConsentVersion,
      href: context.config.sharingConsentHref,
    },
  })
  return result.success
    ? teacherClassroomNoStoreJson(result.data)
    : teacherClassroomNoStoreJson({ error: 'Davet kullanılamıyor' }, { status: 500 })
}
