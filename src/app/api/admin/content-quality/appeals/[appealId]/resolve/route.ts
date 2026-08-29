import { z } from 'zod'
import { requireContentGovernanceContext, contentRpc } from '@/lib/content-governance/route-context'
import { contentGovernanceWriteLimiter } from '@/lib/content-governance/rate-limits'
import { appealResolveInputSchema, appealResolveResultSchema, contentGovernanceRpcStatus, contentNoStoreJson } from '@/lib/content-governance/server-contract'
import { ERROR_REPORT_COIN_REWARD } from '@/lib/constants/rewards'
import { createNotification } from '@/lib/notifications/create'

const legacyTransitionSchema = z.object({
  legacy: z.boolean(), awarded: z.boolean(), replayed: z.boolean(),
  coins: z.number().int().nonnegative().max(300), userId: z.string().uuid().nullable(),
}).strip()

export async function POST(request: Request, { params }: { params: Promise<{ appealId: string }> }) {
  const context = await requireContentGovernanceContext(request, contentGovernanceWriteLimiter, 'content.appeals.manage'); if (!context.ok) return context.response
  const id = z.string().uuid().safeParse((await params).appealId), body = appealResolveInputSchema.safeParse(await request.json().catch(() => null))
  if (!id.success || !body.success) return contentNoStoreJson({ error: 'Geçersiz itiraz kararı' }, { status: 400 })
  const { data, error } = await contentRpc(context.admin, 'resolve_question_appeal', { p_user_id: context.userId, p_appeal_id: id.data, p_status: body.data.status, p_public_message: body.data.publicMessage, p_internal_note: body.data.internalNote, p_request_id: body.data.requestId })
  if (error) return contentNoStoreJson({ error: 'İtiraz çözülemedi' }, { status: contentGovernanceRpcStatus(error.code) })
  const result = appealResolveResultSchema.safeParse(data)
  if (!result.success) return contentNoStoreJson({ error: 'İtiraz çözülemedi' }, { status: 500 })

  // Governance öncesi öğrenciye verilmiş ödül vaadini koru. Yeni itirazlarda
  // RPC `legacy:false` döner ve hiçbir ödül oluşmaz. İkinci RPC idempotenttir;
  // ilk işlemden sonra hata olursa aynı request güvenle tekrar edilebilir.
  const { data: transitionData, error: transitionError } = await contentRpc(
    context.admin,
    'finalize_legacy_question_appeal_transition',
    { p_user_id: context.userId, p_appeal_id: id.data, p_coins: ERROR_REPORT_COIN_REWARD },
  )
  const transition = legacyTransitionSchema.safeParse(transitionData)
  if (transitionError || !transition.success) {
    return contentNoStoreJson({ error: 'İtiraz geçişi tamamlanamadı; aynı isteği tekrar deneyin' }, { status: 500 })
  }
  if (transition.data.awarded && transition.data.userId) {
    try {
      await createNotification(context.admin, {
        userId: transition.data.userId,
        type: 'error_report_rewarded',
        title: '🦉 Teşekkürler, gözünden kaçmadı!',
        body: `Bildirdiğin soruyu kontrol ettik ve haklıydın — hesabına ${transition.data.coins} altın eklendi.`,
        link: '/arena/magaza',
      })
    } catch {
      console.error('[content-quality/appeals] legacy reward notification failed')
    }
  }
  return contentNoStoreJson(result.data)
}
