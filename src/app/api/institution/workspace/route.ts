import { requireInstitutionPilotRouteContext } from '@/lib/institution-pilot/route-context'
import {
  institutionPilotNoStoreJson,
  institutionPilotRpcStatus,
  institutionPilotWorkspaceSchema,
} from '@/lib/institution-pilot/server-contract'

export async function GET(request: Request) {
  const context = await requireInstitutionPilotRouteContext(request)
  if (!context.ok) return context.response

  const { data, error } = await context.admin.rpc('get_my_pilot_institution', {
    p_user_id: context.userId,
  })
  if (error) {
    return institutionPilotNoStoreJson(
      { error: 'Kurum çalışma alanı alınamadı' },
      { status: institutionPilotRpcStatus(error.code) },
    )
  }

  const result = institutionPilotWorkspaceSchema.safeParse(data)
  return result.success
    ? institutionPilotNoStoreJson(result.data)
    : institutionPilotNoStoreJson(
      { error: 'Kurum çalışma alanı alınamadı' },
      { status: 500 },
    )
}
