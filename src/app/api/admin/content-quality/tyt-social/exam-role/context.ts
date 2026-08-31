import type { SupabaseClient } from '@supabase/supabase-js'
import { checkPermission } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getAal2Status } from '@/lib/auth/aal2'
import { checkContentGovernanceRateLimit, contentGovernanceWriteLimiter } from '@/lib/content-governance/rate-limits'
import { contentNoStoreJson } from '@/lib/content-governance/server-contract'
import { contentGovernanceEnabled } from '@/lib/content-governance/server-security'
import type { Database } from '@/types/database.client'

export type TytSocialExamRolePermission = 'content.prepare' | 'content.review.stage1' | 'content.review.stage2'
export type TytSocialExamRoleContext = {
  ok: true
  userId: string
  client: SupabaseClient<Database>
}
export type TytSocialExamRoleFailure = { ok: false; response: Response }

export async function requireTytSocialExamRoleContext(
  request: Request,
  permission: TytSocialExamRolePermission,
): Promise<TytSocialExamRoleContext | TytSocialExamRoleFailure> {
  if (!contentGovernanceEnabled()) {
    return { ok: false, response: contentNoStoreJson({ error: 'İçerik kalitesi pilotu etkin değil' }, { status: 503 }) }
  }

  let client: SupabaseClient<Database>
  try {
    client = await createClient()
    const { data: { user }, error } = await client.auth.getUser()
    if (error || !user) return { ok: false, response: contentNoStoreJson({ error: 'Yetkisiz' }, { status: 401 }) }

    const limited = await checkContentGovernanceRateLimit(contentGovernanceWriteLimiter, user.id, request.headers)
    if (!limited.success) {
      return {
        ok: false,
        response: contentNoStoreJson({ error: 'Çok fazla istek' }, {
          status: 429,
          headers: { 'Retry-After': String(limited.retryAfter) },
        }),
      }
    }

    const aal2 = await getAal2Status(client)
    if (!aal2.isAal2) return { ok: false, response: contentNoStoreJson({ error: 'AAL2 gerekli' }, { status: 403 }) }
    if (!await checkPermission(client, permission)) {
      return { ok: false, response: contentNoStoreJson({ error: 'Yetkiniz yok' }, { status: 403 }) }
    }
    return { ok: true, userId: user.id, client }
  } catch {
    return { ok: false, response: contentNoStoreJson({ error: 'İçerik kalitesi pilotu kullanılamıyor' }, { status: 503 }) }
  }
}

export async function tytSocialExamRoleRpc(
  client: SupabaseClient<Database>,
  name: 'prepare_tyt_social_exam_role' | 'review_tyt_social_exam_role',
  args: Record<string, unknown>,
) {
  const rpc = client.rpc.bind(client) as unknown as (
    functionName: string,
    parameters: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string } | null }>
  return rpc(name, args)
}
