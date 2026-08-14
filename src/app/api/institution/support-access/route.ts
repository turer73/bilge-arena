import { teacherClassroomWriteLimiter } from '@/lib/teacher-classroom/rate-limits'
import { requireInstitutionPilotRouteContext } from '@/lib/institution-pilot/route-context'
import { institutionPilotNoStoreJson, institutionPilotRpcStatus } from '@/lib/institution-pilot/server-contract'
import {
  institutionSupportAccessSchema,
  institutionSupportGrantInputSchema,
  institutionSupportRevokeInputSchema,
} from '@/lib/institution-pilot/support-contract'

async function readBody(request: Request): Promise<unknown | null> {
  try { return await request.json() } catch { return null }
}

function resultResponse(data: unknown) {
  const result = institutionSupportAccessSchema.safeParse(data)
  return result.success
    ? institutionPilotNoStoreJson(result.data)
    : institutionPilotNoStoreJson({ error: 'Destek erişimi doğrulanamadı' }, { status: 500 })
}

export async function GET(request: Request) {
  const context = await requireInstitutionPilotRouteContext(request)
  if (!context.ok) return context.response
  const { data, error } = await context.admin.rpc('get_my_institution_support_access', {
    p_user_id: context.userId,
  })
  return error
    ? institutionPilotNoStoreJson({ error: 'Destek erişimi alınamadı' }, { status: institutionPilotRpcStatus(error.code) })
    : resultResponse(data)
}

export async function POST(request: Request) {
  const context = await requireInstitutionPilotRouteContext(request, teacherClassroomWriteLimiter)
  if (!context.ok) return context.response
  const input = institutionSupportGrantInputSchema.safeParse(await readBody(request))
  if (!input.success) return institutionPilotNoStoreJson({ error: 'Süre veya gerekçe geçersiz' }, { status: 400 })
  const { data, error } = await context.admin.rpc('grant_my_institution_support_access', {
    p_user_id: context.userId,
    p_duration_minutes: input.data.durationMinutes,
    p_reason: input.data.reason,
    p_request_id: input.data.requestId,
  })
  return error
    ? institutionPilotNoStoreJson({ error: 'Destek erişimi açılamadı' }, { status: institutionPilotRpcStatus(error.code) })
    : resultResponse(data)
}

export async function DELETE(request: Request) {
  const context = await requireInstitutionPilotRouteContext(request, teacherClassroomWriteLimiter)
  if (!context.ok) return context.response
  const input = institutionSupportRevokeInputSchema.safeParse(await readBody(request))
  if (!input.success) return institutionPilotNoStoreJson({ error: 'İstek kimliği geçersiz' }, { status: 400 })
  const { data, error } = await context.admin.rpc('revoke_my_institution_support_access', {
    p_user_id: context.userId,
    p_request_id: input.data.requestId,
  })
  return error
    ? institutionPilotNoStoreJson({ error: 'Destek erişimi kapatılamadı' }, { status: institutionPilotRpcStatus(error.code) })
    : resultResponse(data)
}
