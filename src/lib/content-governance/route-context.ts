import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'
import { contentNoStoreJson } from './server-contract'
import { checkContentGovernanceRateLimit, type ContentGovernanceLimiter } from './rate-limits'
import { contentGovernanceEnabled } from './server-security'

export type ContentGovernanceContext = { ok: true; userId: string; admin: ReturnType<typeof createServiceRoleClient> }
export type ContentGovernanceFailure = { ok: false; response: Response }
export async function requireContentGovernanceContext(
  request: Request, limiter: ContentGovernanceLimiter, permission?: string | readonly string[],
): Promise<ContentGovernanceContext | ContentGovernanceFailure> {
  if (!contentGovernanceEnabled()) return { ok: false, response: contentNoStoreJson({ error: 'İçerik kalitesi pilotu etkin değil' }, { status: 503 }) }
  const client = await createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return { ok: false, response: contentNoStoreJson({ error: 'Yetkisiz' }, { status: 401 }) }
  const limited = await checkContentGovernanceRateLimit(limiter, user.id, request.headers)
  if (!limited.success) return { ok: false, response: contentNoStoreJson({ error: 'Çok fazla istek' }, { status: 429, headers: { 'Retry-After': String(limited.retryAfter) } }) }
  const permissions = permission ? (Array.isArray(permission) ? permission : [permission]) : []
  if (permissions.length > 0) {
    const granted = await Promise.all(permissions.map((entry) => checkPermission(client, entry)))
    if (!granted.some(Boolean)) return { ok: false, response: contentNoStoreJson({ error: 'Yetkiniz yok' }, { status: 403 }) }
  }
  try { return { ok: true, userId: user.id, admin: createServiceRoleClient() } }
  catch { return { ok: false, response: contentNoStoreJson({ error: 'İçerik kalitesi pilotu kullanılamıyor' }, { status: 503 }) } }
}

/** Type overlay intentionally lags migration 106; keep the unsafe boundary here, never in routes. */
export async function contentRpc(admin: ReturnType<typeof createServiceRoleClient>, name: string, args: Record<string, unknown>) {
  // admin.rpc this'e bağımlıdır; referans çıkarılıp çağrılırsa TypeError fırlatır.
  const rpc = admin.rpc.bind(admin) as unknown as (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { code?: string } | null }>
  return rpc(name, args)
}
