import { z } from 'zod'
import {
  classroomExamModeSchema,
  examModeToggleInputSchema,
  examModeToggleResultSchema,
} from '@/lib/assistance-policy/contract'
import { institutionPilotWorkspaceSchema } from '@/lib/institution-pilot/server-contract'
import type { createServiceRoleClient } from '@/lib/supabase/service-role'
import { requireTeacherClassroomRouteContext } from '@/lib/teacher-classroom/route-context'
import {
  teacherClassroomReadLimiter,
  teacherClassroomWriteLimiter,
} from '@/lib/teacher-classroom/rate-limits'
import {
  teacherClassroomNoStoreJson,
  teacherClassroomRpcStatus,
} from '@/lib/teacher-classroom/server-contract'

const classroomIdSchema = z.string().uuid()

async function activeInstitutionId(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
): Promise<string | null> {
  const workspace = await admin.rpc('get_my_pilot_institution', { p_user_id: userId })
  if (workspace.error) return null
  const parsed = institutionPilotWorkspaceSchema.safeParse(workspace.data)
  return parsed.success ? parsed.data.institution.id : null
}

/**
 * GET /api/teacher/classrooms/[classroomId]/exam-mode
 *
 * Ogretmen panelinin sayfa yenilendiginde acik pencereyi ve kalan sureyi
 * gosterebilmesi icin gerekli; yazma ucunun donusu tek basina yeterli degil.
 */
export async function GET(
  request: Request,
  routeContext: { params: Promise<{ classroomId: string }> },
) {
  const context = await requireTeacherClassroomRouteContext(request, teacherClassroomReadLimiter)
  if (!context.ok) return context.response

  const classroomId = classroomIdSchema.safeParse((await routeContext.params).classroomId)
  if (!classroomId.success) {
    return teacherClassroomNoStoreJson({ error: 'Geçersiz sınıf' }, { status: 400 })
  }
  const institutionId = await activeInstitutionId(context.admin, context.userId)
  if (!institutionId) {
    return teacherClassroomNoStoreJson({ error: 'Kurum üyeliği gerekli' }, { status: 403 })
  }

  const { data, error } = await context.admin.rpc('get_my_classroom_exam_mode', {
    p_user_id: context.userId,
    p_classroom_id: classroomId.data,
    p_institution_id: institutionId,
  })
  if (error) {
    return teacherClassroomNoStoreJson(
      { error: 'Sınav modu durumu alınamadı' },
      { status: teacherClassroomRpcStatus(error.code) },
    )
  }
  const result = classroomExamModeSchema.safeParse(data)
  return result.success
    ? teacherClassroomNoStoreJson(result.data)
    : teacherClassroomNoStoreJson({ error: 'Sınav modu durumu alınamadı' }, { status: 500 })
}

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

  const institutionId = await activeInstitutionId(context.admin, context.userId)
  if (!institutionId) {
    return teacherClassroomNoStoreJson({ error: 'Kurum üyeliği gerekli' }, { status: 403 })
  }

  const { data, error } = await context.admin.rpc('set_teacher_classroom_exam_mode', {
    p_user_id: context.userId,
    p_classroom_id: classroomId.data,
    p_institution_id: institutionId,
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
