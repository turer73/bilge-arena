import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { paperPackReadLimiter } from '@/lib/paper-mode/rate-limits'
import {
  paperPackRpcStatus,
  paperPackViewSchema,
  privateNoStoreJson,
} from '@/lib/paper-mode/server-contract'

const packIdSchema = z.string().uuid()

export async function GET(
  _request: Request,
  context: { params: Promise<{ packId: string }> },
) {
  if (process.env.PAPER_MODE_ENABLED !== 'true') {
    return privateNoStoreJson({ error: 'Kağıt modu devre dışı' }, { status: 503 })
  }

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) return privateNoStoreJson({ error: 'Yetkisiz' }, { status: 401 })

  const rateLimit = await paperPackReadLimiter.check(user.id)
  if (!rateLimit.success) {
    return privateNoStoreJson(
      { error: 'Çok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter ?? 60) } },
    )
  }

  const packId = packIdSchema.safeParse((await context.params).packId)
  if (!packId.success) return privateNoStoreJson({ error: 'Geçersiz paket' }, { status: 400 })

  const admin = createServiceRoleClient()
  const { data, error } = await admin.rpc('get_my_paper_study_pack', {
    p_user_id: user.id,
    p_pack_id: packId.data,
  })
  if (error) {
    return privateNoStoreJson(
      { error: 'Kağıt paketi alınamadı' },
      { status: paperPackRpcStatus(error.code) },
    )
  }

  const result = paperPackViewSchema.safeParse(data)
  if (!result.success) {
    return privateNoStoreJson({ error: 'Kağıt paketi alınamadı' }, { status: 500 })
  }
  return privateNoStoreJson(result.data)
}
