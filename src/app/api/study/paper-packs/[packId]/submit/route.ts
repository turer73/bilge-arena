import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { paperPackSubmitLimiter } from '@/lib/paper-mode/rate-limits'
import {
  buildPaperPackRpcAnswers,
  paperPackRpcStatus,
  paperPackSubmitInputSchema,
  paperPackSubmitReceiptSchema,
  paperPackViewSchema,
  privateNoStoreJson,
} from '@/lib/paper-mode/server-contract'

const packIdSchema = z.string().uuid()

export async function POST(
  request: Request,
  context: { params: Promise<{ packId: string }> },
) {
  if (process.env.PAPER_MODE_ENABLED !== 'true') {
    return privateNoStoreJson({ error: 'Kağıt modu devre dışı' }, { status: 503 })
  }

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) return privateNoStoreJson({ error: 'Yetkisiz' }, { status: 401 })

  const rateLimit = await paperPackSubmitLimiter.check(user.id)
  if (!rateLimit.success) {
    return privateNoStoreJson(
      { error: 'Çok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter ?? 60) } },
    )
  }

  const packId = packIdSchema.safeParse((await context.params).packId)
  const body = paperPackSubmitInputSchema.safeParse(await request.json().catch(() => null))
  if (!packId.success || !body.success) {
    return privateNoStoreJson({ error: 'Geçersiz cevap gönderimi' }, { status: 400 })
  }

  const admin = createServiceRoleClient()
  const current = await admin.rpc('get_my_paper_study_pack', {
    p_user_id: user.id,
    p_pack_id: packId.data,
  })
  if (current.error) {
    return privateNoStoreJson(
      { error: 'Kağıt paketi alınamadı' },
      { status: paperPackRpcStatus(current.error.code) },
    )
  }
  const currentPack = paperPackViewSchema.safeParse(current.data)
  if (!currentPack.success) {
    return privateNoStoreJson({ error: 'Kağıt paketi alınamadı' }, { status: 500 })
  }
  const rpcAnswers = buildPaperPackRpcAnswers(currentPack.data, body.data)
  if (!rpcAnswers) {
    return privateNoStoreJson({ error: 'Cevaplar paketle eşleşmiyor' }, { status: 400 })
  }

  const submission = await admin.rpc('submit_paper_study_pack', {
    p_user_id: user.id,
    p_pack_id: packId.data,
    p_answers: rpcAnswers,
    p_request_id: body.data.requestId,
  })
  if (submission.error) {
    return privateNoStoreJson(
      { error: 'Kağıt cevapları kaydedilemedi' },
      { status: paperPackRpcStatus(submission.error.code) },
    )
  }

  const receipt = paperPackSubmitReceiptSchema.safeParse(submission.data)
  if (!receipt.success || receipt.data.packId !== packId.data) {
    return privateNoStoreJson({ error: 'Kağıt cevapları kaydedilemedi' }, { status: 500 })
  }

  const loaded = await admin.rpc('get_my_paper_study_pack', {
    p_user_id: user.id,
    p_pack_id: packId.data,
  })
  if (loaded.error) {
    return privateNoStoreJson({ error: 'Kağıt sonucu alınamadı' }, { status: 500 })
  }
  const pack = paperPackViewSchema.safeParse(loaded.data)
  if (!pack.success || pack.data.status !== 'submitted') {
    return privateNoStoreJson({ error: 'Kağıt sonucu alınamadı' }, { status: 500 })
  }

  return privateNoStoreJson({ pack: pack.data, replayed: receipt.data.replayed })
}
