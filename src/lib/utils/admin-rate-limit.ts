import { NextResponse } from 'next/server'
import { createRateLimiter } from './rate-limit'

/**
 * Admin mutasyon endpoint'leri için ortak rate-limit (admin user-id bazlı).
 *
 * Hedef: çalıntı admin oturumu / runaway script'in sınırsız yazma yapmasını
 * engellemek — insan admin UI temposunu kısıtlamak değil. Bu yüzden paylaşılan
 * tek kova (60/dk) + upload için ayrı dar kova (10/dk).
 * checkPermission'dan SONRA çağrılır (403, 429'dan önce gelsin).
 */
const mutationLimiter = createRateLimiter('admin-mutation', 60, 60_000)
const uploadLimiter = createRateLimiter('admin-upload', 10, 60_000)

/** Limit aşıldıysa 429 Response döner, değilse null — `if (rlRes) return rlRes` */
export async function checkAdminMutationRl(
  adminId: string,
  kind: 'mutation' | 'upload' = 'mutation',
): Promise<NextResponse | null> {
  const limiter = kind === 'upload' ? uploadLimiter : mutationLimiter
  const rl = await limiter.check(adminId)
  if (!rl.success) {
    if (rl.reason === 'backend_unavailable') {
      return NextResponse.json(
        { error: 'Güvenlik servisi geçici olarak kullanılamıyor' },
        { status: 503, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
      )
    }
    return NextResponse.json(
      { error: 'Çok fazla istek' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } },
    )
  }
  return null
}
