import { z } from 'zod'
import {
  examModeToggleInputSchema,
  examModeToggleResultSchema,
} from '@/lib/assistance-policy/contract'
import { institutionPilotWorkspaceSchema } from '@/lib/institution-pilot/server-contract'
import { requireTeacherClassroomRouteContext } from '@/lib/teacher-classroom/route-context'
import { teacherClassroomWriteLimiter } from '@/lib/teacher-classroom/rate-limits'
import {
  teacherClassroomNoStoreJson,
  teacherClassroomRpcStatus,
} from '@/lib/teacher-classroom/server-contract'

const classroomIdSchema = z.string().uuid()

/**
 * PATCH /api/teacher/classrooms/[classroomId]/exam-mode
 *
 * Sinif bazli sinav modu. Bilge Tahta ayarindan farkli olarak tek bir pilot
 * kurum kimligine baglanmaz: her kurumun ogretmeni kendi sinifinda sinav
 * modunu acabilmelidir. Kurum kimligi ogretmenin aktif uyeliginden okunur,
 * SQL tarafi ayrica dogrular.
 */
export async function PATCH(
  request: Request,
  routeContext: { params: Promise<{ classroomId: string }> },
) {
  const context = await requireTeacherClassroomRouteContext(request, teacherClassroomWriteLimiter, true)
  if (!context.ok) return context.response

  const classroomId = classroomIdSchema.safeParse((await routeContext.params).classroomId)
  const body = examModeToggleInputSchema.safeParse(await request.json().catch(() => null))
  if (!classroomId.success || !body.success) {
    return teacherClassroomNoStoreJson({ error: 'Geçersiz sınav modu isteği' }, { status: 400 })
  }

  const workspace = await context.admin.rpc('get_my_pilot_institution', {
    p_user_id: context.userId,
  })
  if (workspace.error) {
    return teacherClassroomNoStoreJson(
      { error: 'Kurum üyeliği doğrulanamadı' },
      { status: teacherClassroomRpcStatus(workspace.error.code) },
    )
  }
  const parsedWorkspace = institutionPilotWorkspaceSchema.safeParse(workspace.data)
  if (!parsedWorkspace.success) {
    return teacherClassroomNoStoreJson({ error: 'Kurum üyeliği gerekli' }, { status: 403 })
  }

  const { data, error } = await context.admin.rpc('set_teacher_classroom_exam_mode', {
    p_user_id: context.userId,
    p_classroom_id: classroomId.data,
    p_institution_id: parsedWorkspace.data.institution.id,
    p_enabled: body.data.enabled,
    p_request_id: body.data.requestId,
  })
  if (error) {
    return teacherClassroomNoStoreJson(
      { error: 'Sınav modu kaydedilemedi' },
      { status: teacherClassroomRpcStatus(error.code) },
    )
  }

  const result = examModeToggleResultSchema.safeParse(data)
  return result.success && result.data.classroomId === classroomId.data
    ? teacherClassroomNoStoreJson(result.data)
    : teacherClassroomNoStoreJson({ error: 'Sınav modu kaydedilemedi' }, { status: 500 })
}
