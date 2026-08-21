import { teacherClassroomWriteLimiter } from '@/lib/teacher-classroom/rate-limits'
import { requireInstitutionPilotRouteContext } from '@/lib/institution-pilot/route-context'
import { institutionPilotNoStoreJson, institutionPilotRpcStatus } from '@/lib/institution-pilot/server-contract'
import {
  institutionRoleAssignmentMutationSchema,
  institutionRoleRequestSchema,
} from '@/lib/institution-pilot/role-contract'

const refPattern = /^[0-9a-f]{32}$/

async function updateAssignment(
  request: Request,
  params: Promise<{ roleRef: string; memberRef: string }>,
  assigned: boolean,
) {
  const context = await requireInstitutionPilotRouteContext(request, teacherClassroomWriteLimiter)
  if (!context.ok) return context.response
  const { roleRef, memberRef } = await params
  const input = institutionRoleRequestSchema.safeParse(await request.json().catch(() => null))
  if (!refPattern.test(roleRef) || !refPattern.test(memberRef) || !input.success) {
    return institutionPilotNoStoreJson({ error: 'Rol atama isteği geçersiz' }, { status: 400 })
  }
  const { data, error } = await context.admin.rpc('set_my_institution_role_assignment', {
    p_user_id: context.userId,
    p_role_ref: roleRef,
    p_member_ref: memberRef,
    p_assigned: assigned,
    p_request_id: input.data.requestId,
  })
  if (error) return institutionPilotNoStoreJson({ error: 'Rol ataması güncellenemedi' }, { status: institutionPilotRpcStatus(error.code) })
  const result = institutionRoleAssignmentMutationSchema.safeParse(data)
  return result.success
    ? institutionPilotNoStoreJson(result.data)
    : institutionPilotNoStoreJson({ error: 'Rol ataması doğrulanamadı' }, { status: 500 })
}

export function POST(request: Request, { params }: { params: Promise<{ roleRef: string; memberRef: string }> }) {
  return updateAssignment(request, params, true)
}

export function DELETE(request: Request, { params }: { params: Promise<{ roleRef: string; memberRef: string }> }) {
  return updateAssignment(request, params, false)
}
