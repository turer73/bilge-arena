import { teacherClassroomWriteLimiter } from '@/lib/teacher-classroom/rate-limits'
import { requireInstitutionPilotRouteContext } from '@/lib/institution-pilot/route-context'
import { institutionPilotNoStoreJson, institutionPilotRpcStatus } from '@/lib/institution-pilot/server-contract'
import {
  institutionRoleDeleteMutationSchema,
  institutionRoleMutationSchema,
  institutionRoleRequestSchema,
  institutionRoleWriteSchema,
} from '@/lib/institution-pilot/role-contract'

const roleRefPattern = /^[0-9a-f]{32}$/

export async function PATCH(request: Request, { params }: { params: Promise<{ roleRef: string }> }) {
  const context = await requireInstitutionPilotRouteContext(request, teacherClassroomWriteLimiter)
  if (!context.ok) return context.response
  const { roleRef } = await params
  const input = institutionRoleWriteSchema.safeParse(await request.json().catch(() => null))
  if (!roleRefPattern.test(roleRef) || !input.success) {
    return institutionPilotNoStoreJson({ error: 'Rol bilgileri geçersiz' }, { status: 400 })
  }
  const { data, error } = await context.admin.rpc('update_my_institution_role', {
    p_user_id: context.userId,
    p_role_ref: roleRef,
    p_name: input.data.name,
    p_description: input.data.description ?? '',
    p_permissions: input.data.permissions,
    p_request_id: input.data.requestId,
  })
  if (error) return institutionPilotNoStoreJson({ error: 'Kurum rolü güncellenemedi' }, { status: institutionPilotRpcStatus(error.code) })
  const result = institutionRoleMutationSchema.safeParse(data)
  return result.success
    ? institutionPilotNoStoreJson(result.data)
    : institutionPilotNoStoreJson({ error: 'Kurum rolü doğrulanamadı' }, { status: 500 })
}
export async function DELETE(request: Request, { params }: { params: Promise<{ roleRef: string }> }) {
  const context = await requireInstitutionPilotRouteContext(request, teacherClassroomWriteLimiter)
  if (!context.ok) return context.response
  const { roleRef } = await params
  const input = institutionRoleRequestSchema.safeParse(await request.json().catch(() => null))
  if (!roleRefPattern.test(roleRef) || !input.success) {
    return institutionPilotNoStoreJson({ error: 'Rol isteği geçersiz' }, { status: 400 })
  }
  const { data, error } = await context.admin.rpc('delete_my_institution_role', {
    p_user_id: context.userId,
    p_role_ref: roleRef,
    p_request_id: input.data.requestId,
  })
  if (error) return institutionPilotNoStoreJson({ error: 'Kurum rolü silinemedi' }, { status: institutionPilotRpcStatus(error.code) })
  const result = institutionRoleDeleteMutationSchema.safeParse(data)
  return result.success
    ? institutionPilotNoStoreJson(result.data)
    : institutionPilotNoStoreJson({ error: 'Kurum rolü doğrulanamadı' }, { status: 500 })
}
