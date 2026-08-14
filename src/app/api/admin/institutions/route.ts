import { NextResponse, type NextRequest } from 'next/server'
import { checkPermission, logAdminAction } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import {
  institutionAdminDirectorySchema,
  provisionInstitutionInputSchema,
  provisionInstitutionResultSchema,
} from '@/lib/institution-admin/contracts'
import { institutionPilotRpcStatus } from '@/lib/institution-pilot/server-contract'
import { isInstitutionPilotEnabled } from '@/lib/institution-pilot/server-security'

const provisionLimiter = createRateLimiter('admin-institution-provision', 5, 60_000)

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' },
  })
}

type InstitutionAdminContext =
  | { ok: true; admin: NonNullable<Awaited<ReturnType<typeof checkPermission>>>; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; response: NextResponse }

async function requireInstitutionAdmin(): Promise<InstitutionAdminContext> {
  if (!isInstitutionPilotEnabled()) return { ok: false, response: noStore({ error: 'Kurum pilotu yapılandırılmadı' }, 503) }
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'institution.pilots.manage')
  return admin
    ? { ok: true, admin, supabase }
    : { ok: false, response: noStore({ error: 'Yetkisiz erişim' }, 403) }
}

export async function GET() {
  const context = await requireInstitutionAdmin()
  if (!context.ok) return context.response

  const service = createServiceRoleClient()
  const { data, error } = await service.rpc('list_pilot_institutions', {
    p_user_id: context.admin.id,
  })
  if (error) return noStore({ error: 'Kurum listesi alınamadı' }, institutionPilotRpcStatus(error.code))
  const parsed = institutionAdminDirectorySchema.safeParse(data)
  return parsed.success
    ? noStore(parsed.data)
    : noStore({ error: 'Kurum listesi doğrulanamadı' }, 500)
}

export async function POST(request: NextRequest) {
  const context = await requireInstitutionAdmin()
  if (!context.ok) return context.response

  const rateLimit = await provisionLimiter.check(context.admin.id)
  if (!rateLimit.success) return noStore({ error: 'Çok fazla kurum oluşturma isteği' }, 429)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return noStore({ error: 'Geçersiz istek' }, 400)
  }
  const input = provisionInstitutionInputSchema.safeParse(body)
  if (!input.success) return noStore({ error: 'Kurum adı ve yönetici seçimi geçersiz' }, 400)

  const service = createServiceRoleClient()
  const { data, error } = await service.rpc('provision_pilot_institution', {
    p_user_id: context.admin.id,
    p_name: input.data.name,
    p_manager_user_id: input.data.managerUserId,
    p_request_id: input.data.requestId,
  })
  if (error) return noStore({ error: 'Kurum oluşturulamadı' }, institutionPilotRpcStatus(error.code))

  const parsed = provisionInstitutionResultSchema.safeParse(data)
  if (!parsed.success) return noStore({ error: 'Kurum sonucu doğrulanamadı' }, 500)
  await logAdminAction(context.supabase, {
    adminId: context.admin.id,
    action: 'provision_institution',
    targetType: 'pilot_institution',
    targetId: parsed.data.institution.id,
    details: { managerUserId: input.data.managerUserId, name: parsed.data.institution.name },
    request,
  })
  return noStore(parsed.data, 201)
}
