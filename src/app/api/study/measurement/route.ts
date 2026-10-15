import { type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'
import { measurementContextSchema, measurementRequestSchema, measurementSessionSchema } from '@/lib/measurement/contracts'
import { measurementEnabled, measurementSchemaReady, measurementJson as json, measurementRpc } from '@/lib/measurement/server'

const ipLimit = createRateLimiter('measurement-ip', 120, 60_000)
const userLimit = createRateLimiter('measurement-user', 90, 60_000)
async function actor(request: NextRequest) {
  const ip = await ipLimit.check(getClientIp(request.headers))
  if (!ip.success) return json({ error: 'İstek şu an işlenemiyor.' }, ip.reason === 'backend_unavailable' ? 503 : 429)
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return json({ error: 'Giriş gerekli.' }, 401)
  const userResult = await userLimit.check(user.id)
  if (!userResult.success) return json({ error: 'İstek şu an işlenemiyor.' }, userResult.reason === 'backend_unavailable' ? 503 : 429)
  return user.id
}
export async function GET(request: NextRequest) {
  try {
    const user = await actor(request)
    if (typeof user !== 'string') return user
    if (!measurementSchemaReady()) return json({ forms: [], session: null })
    const result = await measurementRpc(createServiceRoleClient(), 'get_measurement_context', { p_user_id: user })
    if (result.error) return json({ error: 'Ölçüm yüklenemedi.' }, 503)
    const context = measurementContextSchema.parse(result.data)
    if (!measurementEnabled()) context.forms = []
    return json(context)
  } catch { return json({ error: 'Ölçüm yüklenemedi.' }, 503) }
}
export async function POST(request: NextRequest) {
  try {
    const user = await actor(request)
    if (typeof user !== 'string') return user
    // Same-origin browser flow. No cross-origin state changes using auth cookies.
    const origin = request.headers.get('origin')
    if (origin && origin !== request.nextUrl.origin) return json({ error: 'Geçersiz kaynak.' }, 403)
    const parsed = measurementRequestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return json({ error: 'Geçersiz istek.' }, 400)
    const body = parsed.data
    if (!measurementSchemaReady() || (!measurementEnabled() && body.action === 'start')) {
      return json({ error: 'Yeni ölçüm turu şu an kapalı.' }, 503)
    }
    const admin = createServiceRoleClient()
    const result = body.action === 'start'
      ? await measurementRpc(admin, 'start_measurement', { p_user_id: user, p_form_id: body.formId, p_request_id: body.requestId })
      : await measurementRpc(admin, 'record_measurement_event', {
        p_user_id: user, p_session_id: body.sessionId, p_action: body.action,
        p_position: body.action === 'abandon' ? null : body.position,
        p_request_id: body.action === 'abandon' ? null : body.requestId,
        p_selected_option: body.action === 'answer' ? body.selectedOption : null,
        p_render_ok: body.action === 'abandon' ? null : body.renderOk,
        p_assistance_used: body.action === 'abandon' ? null : body.assistanceUsed,
        p_interrupted: body.action === 'abandon' ? null : body.interrupted,
        p_render_version: body.action === 'abandon' ? null : body.renderVersion,
      })
    if (result.error) return json({ error: 'İşlem tamamlanamadı; aynı isteği tekrar dene veya turu bırak.' },
      result.error.code === '42501' ? 404 : result.error.code === '22023' ? 400 : result.error.code === '55000' ? 409 : 503)
    return json(measurementSessionSchema.parse(result.data))
  } catch { return json({ error: 'Ölçüm kaydedilemedi.' }, 503) }
}
