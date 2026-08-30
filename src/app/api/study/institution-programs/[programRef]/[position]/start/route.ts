import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { institutionPilotNoStoreJson, institutionPilotRpcStatus } from '@/lib/institution-pilot/server-contract'
import { isInstitutionStudyProgramEnabled, isInstitutionTrackingEnabled } from '@/lib/institution-tracking/server-security'
import { checkTeacherClassroomRateLimit, teacherClassroomWriteLimiter } from '@/lib/teacher-classroom/rate-limits'

const paramsSchema = z.object({ programRef: z.string().regex(/^[0-9a-f]{32}$/), position: z.coerce.number().int().min(1).max(21) }).strict()
const bodySchema = z.object({ requestId: z.string().uuid() }).strict()
const resultSchema = z.object({ status: z.enum(['started', 'completed']), replayed: z.boolean(), startTarget: z.object({ kind: z.enum(['practice', 'diagnostic']), requiredMode: z.enum(['practice', 'diagnostic']), href: z.string().startsWith('/arena/') }).strict() }).strict()

export async function POST(request: Request, context: { params: Promise<{ programRef: string; position: string }> }) {
  if (!isInstitutionTrackingEnabled() || !isInstitutionStudyProgramEnabled()) return institutionPilotNoStoreJson({ error: 'Kurum çalışma programı yapılandırılmadı' }, { status: 503 })
  const params = paramsSchema.safeParse(await context.params)
  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!params.success || !body.success) return institutionPilotNoStoreJson({ error: 'Geçersiz program görevi' }, { status: 400 })
  const cookieClient = await createClient(); const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) return institutionPilotNoStoreJson({ error: 'Yetkisiz' }, { status: 401 })
  const rateLimit = await checkTeacherClassroomRateLimit(teacherClassroomWriteLimiter, user.id, request.headers)
  if (!rateLimit.success) {
    return institutionPilotNoStoreJson({ error: 'Çok fazla istek' }, {
      status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter ?? 60) },
    })
  }
  let admin: ReturnType<typeof createServiceRoleClient>
  try { admin = createServiceRoleClient() } catch { return institutionPilotNoStoreJson({ error: 'Kurum programı yapılandırılmadı' }, { status: 503 }) }
  const { data, error } = await admin.rpc('start_my_institution_study_program_item', { p_user_id: user.id, p_program_ref: params.data.programRef, p_position: params.data.position, p_request_id: body.data.requestId })
  if (error) return institutionPilotNoStoreJson({ error: 'Program görevi başlatılamadı' }, { status: institutionPilotRpcStatus(error.code) })
  const result = resultSchema.safeParse(data)
  return result.success ? institutionPilotNoStoreJson(result.data) : institutionPilotNoStoreJson({ error: 'Program görevi başlatılamadı' }, { status: 500 })
}
