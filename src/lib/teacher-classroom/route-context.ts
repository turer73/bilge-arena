import { createClient } from '@/lib/supabase/server'
import { checkPermission } from '@/lib/supabase/admin'
import {
  checkTeacherClassroomRateLimit,
  type TeacherClassroomLimiter,
} from './rate-limits'
import { teacherClassroomNoStoreJson } from './server-contract'
import {
  getTeacherClassroomServerConfig,
  type TeacherClassroomServerConfig,
} from './server-security'
import { getAal2Status } from '@/lib/auth/aal2'

export type TeacherClassroomRouteContext = {
  ok: true
  userId: string
  admin: Awaited<ReturnType<typeof createClient>>
  config: TeacherClassroomServerConfig
}

export type TeacherClassroomRouteFailure = { ok: false; response: Response }

export async function requireTeacherClassroomRouteContext(
  request: Request,
  limiter: TeacherClassroomLimiter,
  teacherOnly = false,
): Promise<TeacherClassroomRouteContext | TeacherClassroomRouteFailure> {
  const config = getTeacherClassroomServerConfig()
  if (!config) {
    return {
      ok: false,
      response: teacherClassroomNoStoreJson(
        { error: 'Sınıf pilotu yapılandırılmadı' },
        { status: 503 },
      ),
    }
  }

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) {
    return {
      ok: false,
      response: teacherClassroomNoStoreJson({ error: 'Yetkisiz' }, { status: 401 }),
    }
  }

  if (teacherOnly && !(await getAal2Status(cookieClient)).isAal2) {
    return {
      ok: false,
      response: teacherClassroomNoStoreJson(
        {
          error: 'İki adımlı doğrulama gerekli',
          code: 'aal2_required',
          mfaUrl: '/hesap/guvenlik?next=/arena/sinif/ogretmen',
        },
        { status: 428 },
      ),
    }
  }

  const rateLimit = await checkTeacherClassroomRateLimit(limiter, user.id, request.headers)
  if (!rateLimit.success) {
    const backendUnavailable = rateLimit.reason === 'backend_unavailable'
    return {
      ok: false,
      response: teacherClassroomNoStoreJson(
        { error: backendUnavailable ? 'Güvenlik servisi geçici olarak kullanılamıyor' : 'Çok fazla istek' },
        { status: backendUnavailable ? 503 : 429, headers: { 'Retry-After': String(rateLimit.retryAfter ?? 60) } },
      ),
    }
  }

  if (teacherOnly && !(await checkPermission(cookieClient, 'teacher.classrooms.manage'))) {
    return {
      ok: false,
      response: teacherClassroomNoStoreJson({ error: 'Öğretmen yetkisi gerekli' }, { status: 403 }),
    }
  }

  return { ok: true, userId: user.id, admin: cookieClient, config }
}
