import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
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

export type TeacherClassroomRouteContext = {
  ok: true
  userId: string
  admin: ReturnType<typeof createServiceRoleClient>
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

  const rateLimit = await checkTeacherClassroomRateLimit(limiter, user.id, request.headers)
  if (!rateLimit.success) {
    return {
      ok: false,
      response: teacherClassroomNoStoreJson(
        { error: 'Çok fazla istek' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter ?? 60) } },
      ),
    }
  }

  if (teacherOnly && !(await checkPermission(cookieClient, 'teacher.classrooms.manage'))) {
    return {
      ok: false,
      response: teacherClassroomNoStoreJson({ error: 'Öğretmen yetkisi gerekli' }, { status: 403 }),
    }
  }

  try {
    return { ok: true, userId: user.id, admin: createServiceRoleClient(), config }
  } catch {
    return {
      ok: false,
      response: teacherClassroomNoStoreJson(
        { error: 'Sınıf pilotu yapılandırılmadı' },
        { status: 503 },
      ),
    }
  }
}
