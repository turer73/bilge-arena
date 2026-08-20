import { teacherClassroomWriteLimiter } from '@/lib/teacher-classroom/rate-limits'
import { requireInstitutionPilotRouteContext } from '@/lib/institution-pilot/route-context'
import { institutionPilotNoStoreJson, institutionPilotRpcStatus } from '@/lib/institution-pilot/server-contract'
import {
  institutionRoleDirectorySchema,
  institutionRoleMutationSchema,
  institutionRoleWriteSchema,
} from '@/lib/institution-pilot/role-contract'

export async function GET(request: Request) {
  const context = await requireInstitutionPilotRouteContext(request)
  if (!context.ok) return context.response
  const { data, error } = await context.admin.rpc('get_my_institution_role_directory', {
    p_user_id: context.userId,
  })
  if (error) return institutionPilotNoStoreJson(
    { error: 'Kurum rolleri alınamadı' },
    { status: institutionPilotRpcStatus(error.code) },
  )
  const result = institutionRoleDirectorySchema.safeParse(data)
  return result.success
    ? institutionPilotNoStoreJson(result.data)
    : institutionPilotNoStoreJson({ error: 'Kurum rolleri doğrulanamadı' }, { status: 500 })
}
export async function POST(request: Request) {
  const context = await requireInstitutionPilotRouteContext(request, teacherClassroomWriteLimiter)
  if (!context.ok) return context.response
  const input = institutionRoleWriteSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return institutionPilotNoStoreJson({ error: 'Rol bilgileri geçersiz' }, { status: 400 })
  const { data, error } = await context.admin.rpc('create_my_institution_role', {
    p_user_id: context.userId,
    p_name: input.data.name,
    p_description: input.data.description ?? '',
    p_permissions: input.data.permissions,
    p_request_id: input.data.requestId,
  })
  if (error) return institutionPilotNoStoreJson(
    { error: 'Kurum rolü oluşturulamadı' },
    { status: institutionPilotRpcStatus(error.code) },
  )
  const result = institutionRoleMutationSchema.safeParse(data)
  return result.success
    ? institutionPilotNoStoreJson(result.data, { status: 201 })
    : institutionPilotNoStoreJson({ error: 'Kurum rolü doğrulanamadı' }, { status: 500 })
}
