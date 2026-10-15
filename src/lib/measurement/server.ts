import 'server-only'
import { NextResponse } from 'next/server'
import type { createServiceRoleClient } from '@/lib/supabase/service-role'

type Client = ReturnType<typeof createServiceRoleClient>
type RpcName = 'get_measurement_context' | 'start_measurement' | 'record_measurement_event' | 'measurement_feedback_blocked'
export function measurementRpc(client: Client, name: RpcName, args: Record<string, unknown>) {
  const rpc = client.rpc.bind(client) as unknown as (name: RpcName, args: Record<string, unknown>) =>
    Promise<{ data: unknown; error: { code?: string } | null }>
  return rpc(name, args)
}
export function measurementSchemaReady() { return process.env.MEASUREMENT_SCHEMA_READY === 'true' }
export function measurementEnabled() { return measurementSchemaReady() && process.env.MEASUREMENT_ENABLED === 'true' }
export function measurementJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } })
}
/** Guard stays enabled when new starts are stopped; drain/abandon active sessions first. */
export async function measurementFeedbackGuard(admin: Client, userId: string, questionId: string) {
  if (!measurementSchemaReady()) return null
  try {
    const { data, error } = await measurementRpc(admin, 'measurement_feedback_blocked', { p_user_id: userId, p_question_id: questionId })
    if (error || typeof data !== 'boolean') return measurementJson({ error: 'Ölçüm koruması doğrulanamadı.' }, 503)
    return data ? measurementJson({ error: 'Bu sorunun çözümü için ölçüm turunu tamamla veya bırak.' }, 409) : null
  } catch { return measurementJson({ error: 'Ölçüm koruması doğrulanamadı.' }, 503) }
}
