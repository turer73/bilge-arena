import {
  getBilgeTahtaPilotInstitutionId,
  isBilgeTahtaPilotEnabled,
} from '@/lib/bilge-tahta/server'
import { institutionPilotWorkspaceSchema } from '@/lib/institution-pilot/server-contract'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createClient } from '@/lib/supabase/server'

function accessResponse(enabled: boolean, status = 200): Response {
  return Response.json(
    { enabled },
    {
      status,
      headers: {
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  )
}

export async function GET() {
  const pilotInstitutionId = getBilgeTahtaPilotInstitutionId()
  if (!isBilgeTahtaPilotEnabled() || !pilotInstitutionId) return accessResponse(false)

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) return accessResponse(false)

  try {
    const admin = createServiceRoleClient()
    const { data, error } = await admin.rpc('get_my_pilot_institution', {
      p_user_id: user.id,
    })

    if (error?.code === 'P0002') return accessResponse(false)
    if (error) return accessResponse(false, 503)

    const workspace = institutionPilotWorkspaceSchema.safeParse(data)
    return accessResponse(
      workspace.success && workspace.data.institution.id === pilotInstitutionId,
    )
  } catch {
    return accessResponse(false, 503)
  }
}
