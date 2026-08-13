import { checkPermission } from '@/lib/supabase/admin'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createClient } from '@/lib/supabase/server'
import {
  checkTeacherClassroomRateLimit,
  type TeacherClassroomLimiter,
  teacherClassroomReadLimiter,
} from '@/lib/teacher-classroom/rate-limits'
import { institutionPilotNoStoreJson } from './server-contract'
import { isInstitutionPilotEnabled } from './server-security'

export type InstitutionPilotRouteContext = {
  ok: true
  userId: string
  admin: ReturnType<typeof createServiceRoleClient>
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

  const rateLimit = await checkTeacherClassroomRateLimit(
    limiter,
    user.id,
    request.headers,
  )
  if (!rateLimit.success) {
    return {
      ok: false,
      response: institutionPilotNoStoreJson(
        { error: 'Çok fazla istek' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter ?? 60) } },
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

  try {
    return { ok: true, userId: user.id, admin: createServiceRoleClient() }
  } catch {
    return {
      ok: false,
      response: institutionPilotNoStoreJson(
        { error: 'Kurum pilotu yapılandırılmadı' },
        { status: 503 },
      ),
    }
  }
}
