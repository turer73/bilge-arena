import type { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  institutionPilotRpcStatus,
  institutionPilotWorkspaceSchema,
  type InstitutionPilotWorkspace,
} from './server-contract'

type ServiceClient = ReturnType<typeof createServiceRoleClient>

export type InstitutionManagerWorkspaceResult =
  | { ok: true; workspace: InstitutionPilotWorkspace }
  | { ok: false; status: number }

export async function getInstitutionManagerWorkspace(
  admin: ServiceClient,
  userId: string,
): Promise<InstitutionManagerWorkspaceResult> {
  const { data, error } = await admin.rpc('get_my_pilot_institution', {
    p_user_id: userId,
  })
  if (error) return { ok: false, status: institutionPilotRpcStatus(error.code) }

  const parsed = institutionPilotWorkspaceSchema.safeParse(data)
  if (!parsed.success) return { ok: false, status: 500 }
  if (parsed.data.membership.role !== 'manager') return { ok: false, status: 403 }
  return { ok: true, workspace: parsed.data }
}
