import { NextResponse, type NextRequest } from 'next/server'
import { checkPermission, logAdminAction } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import {
  institutionAdminDirectorySchema,
  institutionStatusInputSchema,
  institutionStatusResultSchema,
  provisionInstitutionInputSchema,
  provisionInstitutionResultSchema,
} from '@/lib/institution-admin/contracts'
import { institutionPilotRpcStatus } from '@/lib/institution-pilot/server-contract'
import {
  isInstitutionFreePilotEnabled,
  isInstitutionOnboardingEnabled,
  isInstitutionPilotEnabled,
} from '@/lib/institution-pilot/server-security'

const provisionLimiter = createRateLimiter('admin-institution-provision', 5, 60_000)
const statusLimiter = createRateLimiter('admin-institution-status', 20, 60_000)

function noStore(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'Referrer-Policy': 'no-referrer',
      ...headers,
    },
  })
}

function rateLimitFailure(result: { reason?: string; retryAfter?: number }) {
  const unavailable = result.reason === 'backend_unavailable'
  return noStore(
    { error: unavailable ? 'İstek sınırı altyapısı kullanılamıyor' : 'Çok fazla kurum isteği' },
    unavailable ? 503 : 429,
    { 'Retry-After': String(result.retryAfter ?? 60) },
  )
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

  const { data, error } = await context.supabase.rpc('list_pilot_institutions', {
    p_user_id: context.admin.id,
  })
  if (error) return noStore({ error: 'Kurum listesi alınamadı' }, institutionPilotRpcStatus(error.code))
  const parsed = institutionAdminDirectorySchema.safeParse(data)
  if (!parsed.success) return noStore({ error: 'Kurum listesi doğrulanamadı' }, 500)
  const { databaseControls, ...directory } = parsed.data
  return noStore({
    ...directory,
    provisioning: {
      invitationFreePilotEnabled:
        isInstitutionFreePilotEnabled()
        && databaseControls?.freePilotProvisioningEnabled === true,
      commercialOnboardingEnabled:
        isInstitutionOnboardingEnabled()
        && databaseControls?.commercialProvisioningEnabled === true,
    },
  })
}

export async function POST(request: NextRequest) {
  if (!isInstitutionOnboardingEnabled()) {
    return noStore({ error: 'Yeni kurum kabulü kapalı' }, 503)
  }

  const context = await requireInstitutionAdmin()
  if (!context.ok) return context.response

  const rateLimit = await provisionLimiter.check(context.admin.id)
  if (!rateLimit.success) return rateLimitFailure(rateLimit)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return noStore({ error: 'Geçersiz istek' }, 400)
  }
  const input = provisionInstitutionInputSchema.safeParse(body)
  if (!input.success) return noStore({ error: 'Kurum adı ve yönetici seçimi geçersiz' }, 400)

  const { data, error } = await context.supabase.rpc('provision_pilot_institution', {
    p_user_id: context.admin.id,
    p_name: input.data.name,
    p_manager_user_id: input.data.managerUserId,
    p_request_id: input.data.requestId,
  })
  if (error) return noStore({ error: 'Kurum oluşturulamadı' }, institutionPilotRpcStatus(error.code))

  const parsed = provisionInstitutionResultSchema.safeParse(data)
  if (!parsed.success) return noStore({ error: 'Kurum sonucu doğrulanamadı' }, 500)
  await logAdminAction({
    adminId: context.admin.id,
    action: 'provision_institution',
    targetType: 'pilot_institution',
    targetId: parsed.data.institution.id,
    details: { managerUserId: input.data.managerUserId, name: parsed.data.institution.name },
    request,
  })
  return noStore(parsed.data, 201)
}

export async function PATCH(request: NextRequest) {
  const context = await requireInstitutionAdmin()
  if (!context.ok) return context.response

  const rateLimit = await statusLimiter.check(context.admin.id)
  if (!rateLimit.success) return rateLimitFailure(rateLimit)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return noStore({ error: 'Geçersiz istek' }, 400)
  }
  const input = institutionStatusInputSchema.safeParse(body)
  if (!input.success) return noStore({ error: 'Kurum durumu veya gerekçe geçersiz' }, 400)

  const { data, error } = await context.supabase.rpc('set_pilot_institution_status', {
    p_user_id: context.admin.id,
    p_institution_id: input.data.institutionId,
    p_status: input.data.status,
    p_reason: input.data.reason,
    p_request_id: input.data.requestId,
  })
  if (error) return noStore({ error: 'Kurum durumu güncellenemedi' }, institutionPilotRpcStatus(error.code))

  const parsed = institutionStatusResultSchema.safeParse(data)
  if (!parsed.success) return noStore({ error: 'Kurum durumu sonucu doğrulanamadı' }, 500)
  const { error: auditError } = await logAdminAction({
    adminId: context.admin.id,
    action: 'set_institution_status',
    targetType: 'pilot_institution',
    targetId: parsed.data.institutionId,
    details: {
      previousStatus: parsed.data.previousStatus,
      status: parsed.data.status,
      reason: input.data.reason,
      changed: parsed.data.changed,
    },
    request,
  })
  // The RPC has already committed both the lifecycle mutation and its immutable
  // institution_operation_events evidence. admin_logs is a redundant platform
  // log; its failure must not make the caller retry a successful mutation.
  if (auditError) {
    console.error('[Institution Status] ikincil admin günlüğü yazılamadı:', auditError.message)
  }
  return noStore(parsed.data)
}
