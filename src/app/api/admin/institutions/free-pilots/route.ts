import type { NextRequest } from 'next/server'
import { checkPermission, logAdminAction } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import {
  provisionFreePilotInputSchema,
  provisionFreePilotResultSchema,
} from '@/lib/institution-admin/contracts'
import {
  institutionPilotNoStoreJson,
  institutionPilotRpcStatus,
} from '@/lib/institution-pilot/server-contract'
import {
  isInstitutionFreePilotEnabled,
  isInstitutionPilotEnabled,
} from '@/lib/institution-pilot/server-security'

const provisionLimiter = createRateLimiter('admin-institution-free-pilot', 5, 60_000)

function rateLimitFailure(result: { reason?: string; retryAfter?: number }) {
  const unavailable = result.reason === 'backend_unavailable'
  return institutionPilotNoStoreJson(
    { error: unavailable ? 'İstek sınırı altyapısı kullanılamıyor' : 'Çok fazla ücretsiz pilot isteği' },
    {
      status: unavailable ? 503 : 429,
      headers: { 'Retry-After': String(result.retryAfter ?? 60) },
    },
  )
}

export async function POST(request: NextRequest) {
  if (!isInstitutionFreePilotEnabled()) {
    return institutionPilotNoStoreJson({ error: 'Ücretsiz kurum pilotu kapalı' }, { status: 503 })
  }
  if (!isInstitutionPilotEnabled()) {
    return institutionPilotNoStoreJson({ error: 'Kurum pilotu yapılandırılmadı' }, { status: 503 })
  }

  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'institution.pilots.manage')
  if (!admin) {
    return institutionPilotNoStoreJson({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  const rateLimit = await provisionLimiter.check(admin.id)
  if (!rateLimit.success) return rateLimitFailure(rateLimit)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return institutionPilotNoStoreJson({ error: 'Geçersiz istek' }, { status: 400 })
  }
  const input = provisionFreePilotInputSchema.safeParse(body)
  if (!input.success) {
    return institutionPilotNoStoreJson(
      { error: 'Kurum, yönetici, süre veya kapasite sınırı geçersiz' },
      { status: 400 },
    )
  }

  const { data, error } = await supabase.rpc('provision_free_pilot_institution', {
    p_user_id: admin.id,
    p_name: input.data.name,
    p_manager_user_id: input.data.managerUserId,
    p_approval_ref: input.data.approvalReference,
    p_student_limit: input.data.studentLimit,
    p_staff_limit: input.data.staffLimit,
    p_trial_days: input.data.trialDays,
    p_request_id: input.data.requestId,
  })
  if (error) {
    return institutionPilotNoStoreJson(
      { error: 'Ücretsiz kurum pilotu oluşturulamadı' },
      { status: institutionPilotRpcStatus(error.code) },
    )
  }

  const parsed = provisionFreePilotResultSchema.safeParse(data)
  if (!parsed.success) {
    return institutionPilotNoStoreJson(
      { error: 'Ücretsiz kurum pilotu sonucu doğrulanamadı' },
      { status: 500 },
    )
  }

  const { error: auditError } = await logAdminAction({
    adminId: admin.id,
    action: 'provision_free_institution_pilot',
    targetType: 'pilot_institution',
    targetId: parsed.data.institution.id,
    details: {
      name: parsed.data.institution.name,
      approvalReference: parsed.data.institution.approvalReference,
      studentLimit: parsed.data.institution.studentLimit,
      staffLimit: parsed.data.institution.staffLimit,
      reviewDueAt: parsed.data.institution.reviewDueAt,
    },
    request,
  })
  // The RPC commits the institution and immutable operation event together.
  // admin_logs is redundant forensic context and must not turn a committed
  // provision into a retry that can confuse the operator.
  if (auditError) {
    console.error('[Institution Free Pilot] ikincil admin günlüğü yazılamadı:', auditError.message)
  }

  return institutionPilotNoStoreJson(parsed.data, { status: 201 })
}
