import { z } from 'zod'
import { requireTeacherClassroomRouteContext } from '@/lib/teacher-classroom/route-context'
import {
  teacherClassroomReadLimiter,
  teacherClassroomWriteLimiter,
} from '@/lib/teacher-classroom/rate-limits'
import {
  classroomBilgeTahtaAccessSchema,
  classroomBilgeTahtaUpdateInputSchema,
  classroomBilgeTahtaUpdateResultSchema,
  teacherClassroomNoStoreJson,
  teacherClassroomRpcStatus,
} from '@/lib/teacher-classroom/server-contract'
import {
  getBilgeTahtaPilotInstitutionId,
  isBilgeTahtaPilotEnabled,
} from '@/lib/bilge-tahta/server'

const classroomIdSchema = z.string().uuid()

function pilotInstitutionId(): string | null {
  if (!isBilgeTahtaPilotEnabled()) return null
  return getBilgeTahtaPilotInstitutionId()
}

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
  const institutionId = pilotInstitutionId()
  if (!institutionId) return teacherClassroomNoStoreJson({ enabled: false })

  const { data, error } = await context.admin.rpc('get_my_classroom_bilge_tahta_access', {
    p_user_id: context.userId,
    p_classroom_id: classroomId.data,
    p_institution_id: institutionId,
  })
  if (error) {
    return teacherClassroomNoStoreJson(
      { error: 'Bilge Tahta ayarı alınamadı' },
      { status: teacherClassroomRpcStatus(error.code) },
    )
  }
  const result = classroomBilgeTahtaAccessSchema.safeParse(data)
  return result.success
    ? teacherClassroomNoStoreJson(result.data)
    : teacherClassroomNoStoreJson({ error: 'Bilge Tahta ayarı alınamadı' }, { status: 500 })
}

export async function PATCH(
  request: Request,
  routeContext: { params: Promise<{ classroomId: string }> },
) {
  const context = await requireTeacherClassroomRouteContext(request, teacherClassroomWriteLimiter, true)
  if (!context.ok) return context.response
  const classroomId = classroomIdSchema.safeParse((await routeContext.params).classroomId)
  const body = classroomBilgeTahtaUpdateInputSchema.safeParse(await request.json().catch(() => null))
  if (!classroomId.success || !body.success) {
    return teacherClassroomNoStoreJson({ error: 'Geçersiz Bilge Tahta ayarı' }, { status: 400 })
  }
  const institutionId = pilotInstitutionId()
  if (!institutionId) {
    return teacherClassroomNoStoreJson({ error: 'Bilge Tahta pilotu kapalı' }, { status: 503 })
  }

  const { data, error } = await context.admin.rpc('set_teacher_classroom_bilge_tahta', {
    p_user_id: context.userId,
    p_classroom_id: classroomId.data,
    p_institution_id: institutionId,
    p_enabled: body.data.enabled,
    p_request_id: body.data.requestId,
  })
  if (error) {
    return teacherClassroomNoStoreJson(
      { error: 'Bilge Tahta ayarı kaydedilemedi' },
      { status: teacherClassroomRpcStatus(error.code) },
    )
  }
  const result = classroomBilgeTahtaUpdateResultSchema.safeParse(data)
  return result.success && result.data.classroomId === classroomId.data
    ? teacherClassroomNoStoreJson(result.data)
    : teacherClassroomNoStoreJson({ error: 'Bilge Tahta ayarı kaydedilemedi' }, { status: 500 })
}
