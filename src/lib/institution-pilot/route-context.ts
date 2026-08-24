import { checkPermission } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  checkTeacherClassroomRateLimit,
  type TeacherClassroomLimiter,
  teacherClassroomReadLimiter,
} from '@/lib/teacher-classroom/rate-limits'
import { institutionPilotNoStoreJson } from './server-contract'
import { isInstitutionPilotEnabled } from './server-security'
import { getAal2Status } from '@/lib/auth/aal2'

export type InstitutionPilotRouteContext = {
  ok: true
  userId: string
  admin: Awaited<ReturnType<typeof createClient>>
}

export type InstitutionPilotRouteFailure = { ok: false; response: Response }

export async function requireInstitutionPilotRouteContext(
  request: Request,
  limiter: TeacherClassroomLimiter = teacherClassroomReadLimiter,
): Promise<InstitutionPilotRouteContext | InstitutionPilotRouteFailure> {
  if (!isInstitutionPilotEnabled()) {
    return {
      ok: false,
      response: institutionPilotNoStoreJson(
        { error: 'Kurum pilotu yapılandırılmadı' },
        { status: 503 },
      ),
    }
  }

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) {
    return {
      ok: false,
      response: institutionPilotNoStoreJson({ error: 'Yetkisiz' }, { status: 401 }),
    }
  }

  if (!(await getAal2Status(cookieClient)).isAal2) {
    return {
      ok: false,
      response: institutionPilotNoStoreJson(
        {
          error: 'İki adımlı doğrulama gerekli',
          code: 'aal2_required',
          mfaUrl: '/hesap/guvenlik?next=/arena/kurum',
        },
        { status: 428 },
      ),
    }
  }

  const rateLimit = await checkTeacherClassroomRateLimit(
    limiter,
    user.id,
    request.headers,
  )
  if (!rateLimit.success) {
    const backendUnavailable = rateLimit.reason === 'backend_unavailable'
    return {
      ok: false,
      response: institutionPilotNoStoreJson(
        { error: backendUnavailable ? 'Güvenlik servisi geçici olarak kullanılamıyor' : 'Çok fazla istek' },
        { status: backendUnavailable ? 503 : 429, headers: { 'Retry-After': String(rateLimit.retryAfter ?? 60) } },
      ),
    }
  }

  if (!(await checkPermission(cookieClient, 'institution.pilot.access'))) {
    return {
      ok: false,
      response: institutionPilotNoStoreJson(
        { error: 'Kurum pilotu yetkisi gerekli' },
        { status: 403 },
      ),
    }
  }

  return { ok: true, userId: user.id, admin: cookieClient }
}
