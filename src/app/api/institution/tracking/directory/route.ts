import { requireInstitutionPilotRouteContext } from '@/lib/institution-pilot/route-context'
import {
  institutionPilotNoStoreJson,
  institutionPilotRpcStatus,
} from '@/lib/institution-pilot/server-contract'
import { institutionTrackingDirectorySchema } from '@/lib/institution-tracking/directory'
import { isInstitutionTrackingEnabled } from '@/lib/institution-tracking/server-security'

export async function GET(request: Request) {
  if (!isInstitutionTrackingEnabled()) {
    return institutionPilotNoStoreJson(
      { error: 'Kurum takip sistemi yapılandırılmadı' },
      { status: 503 },
    )
  }
  const context = await requireInstitutionPilotRouteContext(request)
  if (!context.ok) return context.response

  const { data, error } = await context.admin.rpc('get_institution_tracking_directory', {
    p_user_id: context.userId,
  })
  if (error) {
    return institutionPilotNoStoreJson(
      { error: 'Kurum takip dizini alınamadı' },
      { status: institutionPilotRpcStatus(error.code) },
    )
  }
  const result = institutionTrackingDirectorySchema.safeParse(data)
  return result.success
    ? institutionPilotNoStoreJson(result.data)
    : institutionPilotNoStoreJson({ error: 'Kurum takip dizini alınamadı' }, { status: 500 })
}
