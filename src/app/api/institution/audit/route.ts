import { z } from 'zod'
import { requireInstitutionPilotRouteContext } from '@/lib/institution-pilot/route-context'
import {
  institutionOperationEventsSchema,
  institutionPilotNoStoreJson,
  institutionPilotRpcStatus,
} from '@/lib/institution-pilot/server-contract'

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
}).strict()

export async function GET(request: Request) {
  const context = await requireInstitutionPilotRouteContext(request)
  if (!context.ok) return context.response

  const url = new URL(request.url)
  const query = querySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!query.success) {
    return institutionPilotNoStoreJson(
      { error: 'Geçersiz audit sorgusu' },
      { status: 400 },
    )
  }

  const { data, error } = await context.admin.rpc('get_my_institution_operation_events', {
    p_user_id: context.userId,
    p_limit: query.data.limit,
  })
  if (error) {
    return institutionPilotNoStoreJson(
      { error: 'Kurum işlem geçmişi alınamadı' },
      { status: institutionPilotRpcStatus(error.code) },
    )
  }
  const result = institutionOperationEventsSchema.safeParse(data)
  return result.success
    ? institutionPilotNoStoreJson(result.data)
    : institutionPilotNoStoreJson(
      { error: 'Kurum işlem geçmişi doğrulanamadı' },
      { status: 500 },
    )
}
