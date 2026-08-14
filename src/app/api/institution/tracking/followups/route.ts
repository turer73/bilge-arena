import { z } from 'zod'
import { requireInstitutionPilotRouteContext } from '@/lib/institution-pilot/route-context'
import { institutionPilotNoStoreJson, institutionPilotRpcStatus } from '@/lib/institution-pilot/server-contract'
import {
  institutionFollowupListSchema,
  institutionFollowupMutationSchema,
  institutionFollowupOpenInputSchema,
} from '@/lib/institution-tracking/followup'
import { isInstitutionTrackingEnabled } from '@/lib/institution-tracking/server-security'
import { teacherClassroomWriteLimiter } from '@/lib/teacher-classroom/rate-limits'

const querySchema = z.object({
  classroomId: z.string().uuid(),
  memberRef: z.string().regex(/^[0-9a-f]{32}$/),
}).strict()

export async function GET(request: Request) {
  if (!isInstitutionTrackingEnabled()) {
    return institutionPilotNoStoreJson({ error: 'Kurum öğrenci takibi yapılandırılmadı' }, { status: 503 })
  }
  const context = await requireInstitutionPilotRouteContext(request)
  if (!context.ok) return context.response
  const url = new URL(request.url)
  const query = querySchema.safeParse({
    classroomId: url.searchParams.get('classroomId'),
    memberRef: url.searchParams.get('memberRef'),
  })
  if (!query.success) {
    return institutionPilotNoStoreJson({ error: 'Geçersiz öğrenci takip kapsamı' }, { status: 400 })
  }
  const { data, error } = await context.admin.rpc('get_institution_student_followups', {
    p_user_id: context.userId,
    p_classroom_id: query.data.classroomId,
    p_member_ref: query.data.memberRef,
  })
  if (error) {
    return institutionPilotNoStoreJson(
      { error: 'Öğrenci takip kayıtları alınamadı' },
      { status: institutionPilotRpcStatus(error.code) },
    )
  }
  const result = institutionFollowupListSchema.safeParse(data)
  return result.success
    ? institutionPilotNoStoreJson(result.data)
    : institutionPilotNoStoreJson({ error: 'Öğrenci takip kayıtları alınamadı' }, { status: 500 })
}

export async function POST(request: Request) {
  if (!isInstitutionTrackingEnabled()) {
    return institutionPilotNoStoreJson({ error: 'Kurum öğrenci takibi yapılandırılmadı' }, { status: 503 })
  }
  const context = await requireInstitutionPilotRouteContext(request, teacherClassroomWriteLimiter)
  if (!context.ok) return context.response
  const body = institutionFollowupOpenInputSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) {
    return institutionPilotNoStoreJson({ error: 'Geçersiz öğrenci takip kaydı' }, { status: 400 })
  }
  const { data, error } = await context.admin.rpc('open_institution_student_followup', {
    p_user_id: context.userId,
    p_classroom_id: body.data.classroomId,
    p_member_ref: body.data.memberRef,
    p_reason_code: body.data.reasonCode,
    p_note: body.data.note || null,
    p_request_id: body.data.requestId,
  })
  if (error) {
    return institutionPilotNoStoreJson(
      { error: error.code === '23505' ? 'Bu gerekçeyle açık bir takip zaten var' : 'Öğrenci takip kaydı açılamadı' },
      { status: error.code === '23505' ? 409 : institutionPilotRpcStatus(error.code) },
    )
  }
  const result = institutionFollowupMutationSchema.safeParse(data)
  return result.success
    ? institutionPilotNoStoreJson(result.data)
    : institutionPilotNoStoreJson({ error: 'Öğrenci takip kaydı açılamadı' }, { status: 500 })
}
