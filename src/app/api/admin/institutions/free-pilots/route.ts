import type { NextRequest } from 'next/server'
import { checkPermission, logAdminAction } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sendEmail } from '@/lib/email/send'
import { institutionPilotPackageEmail } from '@/lib/email/templates/institution-pilot-package'
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
import {
  isInstitutionStudyProgramEnabled,
  isInstitutionTrackingEnabled,
} from '@/lib/institution-tracking/server-security'

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
  if (!isInstitutionTrackingEnabled() || !isInstitutionStudyProgramEnabled()) {
    return institutionPilotNoStoreJson(
      { error: 'Kurum takip ve çalışma programı özellikleri kullanıma hazır değil' },
      { status: 503 },
    )
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
      { error: 'Kurum, yönetici, paket onayı, süre veya kapasite sınırı geçersiz' },
      { status: 400 },
    )
  }
  // Deterministic per request id, so a retry of the same form recomputes the
  // payload hash the RPC stored on the first attempt.
  const approvalReference = `PILOT-${input.data.requestId.toUpperCase()}`

  const serviceClient = createServiceRoleClient()
  const { data: managerResult, error: managerError } = await serviceClient.auth.admin.getUserById(
    input.data.managerUserId,
  )
  const managerEmail = managerResult.user?.email
  if (managerError || !managerEmail || !managerResult.user.email_confirmed_at) {
    return institutionPilotNoStoreJson(
      { error: 'Doğrulanmış kurum yöneticisi e-postası bulunamadı' },
      { status: 422 },
    )
  }

  // The RPC is the only authority for replay, the database gate, manager
  // eligibility and the single open slot, all under one transaction. The pilot
  // tables are revoked from service_role (migrations 112 and 158), so this
  // route must not pre-read them: such reads can only fail with 42501.
  const { data, error } = await supabase.rpc('provision_free_pilot_institution', {
    p_user_id: admin.id,
    p_name: input.data.name,
    p_manager_user_id: input.data.managerUserId,
    p_approval_ref: approvalReference,
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

  // The document goes out only after the institution is committed. A replay of
  // the same request id sends it again under the same idempotency key, which is
  // how an operator recovers from a failed delivery without a second pilot.
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://bilgearena.com'
  const documentUrl = baseUrl + '/documents/bilge-arena-kurum-paketleri-v1.pdf'
  const email = institutionPilotPackageEmail({
    institutionName: parsed.data.institution.name,
    managerName: String(managerResult.user.user_metadata?.display_name || managerEmail),
    packageName: input.data.trialDays === 60 ? 'Paket 2 - Gelişim Pilotu' : 'Paket 1 - Başlangıç Pilotu',
    documentUrl,
  })
  const delivery = await sendEmail({
    to: managerEmail,
    subject: email.subject,
    html: email.html,
    template: 'institution_pilot_package_v1',
    userId: input.data.managerUserId,
    idempotencyKey: 'institution-pilot-package-' + input.data.requestId,
    attachments: [{ filename: 'bilge-arena-kurum-paketleri-v1.pdf', path: documentUrl }],
  })
  if (!delivery.ok) {
    console.error('[Institution Free Pilot] zorunlu belge e-postası gönderilemedi:', delivery.error)
  }

  if (!parsed.data.replayed) {
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
        documentEmailId: delivery.id ?? null,
        documentDelivered: delivery.ok,
        documentVersion: '1.0',
      },
      request,
    })
    // The RPC commits the institution and immutable operation event together.
    // admin_logs is redundant forensic context and must not turn a committed
    // provision into a retry that can confuse the operator.
    if (auditError) {
      console.error('[Institution Free Pilot] ikincil admin günlüğü yazılamadı:', auditError.message)
    }
  }

  if (!delivery.ok) {
    // Not a success: the package document is mandatory. The admin form keeps
    // the request id for an unchanged payload, so resubmitting replays the
    // committed pilot and retries only the delivery.
    return institutionPilotNoStoreJson({
      error: 'Kurum oluşturuldu ancak zorunlu belge e-postası gönderilemedi; formu değiştirmeden yeniden gönderin',
      institution: parsed.data.institution,
      documentDelivery: { sent: false, version: '1.0' },
    }, { status: 503 })
  }

  return institutionPilotNoStoreJson({
    ...parsed.data,
    documentDelivery: { sent: true, version: '1.0' },
  }, { status: parsed.data.replayed ? 200 : 201 })
}
