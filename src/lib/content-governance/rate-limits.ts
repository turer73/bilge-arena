import { createRateLimiter } from '@/lib/utils/rate-limit'
import { getClientIp } from '@/lib/utils/client-ip'

function dual(name: string, user: number, ip: number) {
  return { user: createRateLimiter(`${name}-user`, user), ip: createRateLimiter(`${name}-ip`, ip) }
}

export const contentGovernanceReadLimiter = dual('content-governance-read', 60, 180)
export const contentGovernanceWriteLimiter = dual('content-governance-write', 20, 60)
export const contentAppealWriteLimiter = dual('content-appeal-write', 10, 30)
export type ContentGovernanceLimiter = ReturnType<typeof dual>

export async function checkContentGovernanceRateLimit(
  limiter: ContentGovernanceLimiter, userId: string, headers: Headers,
) {
  const [user, ip] = await Promise.all([
    limiter.user.check(userId), limiter.ip.check(getClientIp(headers)),
  ])
  return user.success && ip.success
    ? { success: true as const }
    : { success: false as const, retryAfter: Math.max(user.retryAfter ?? 0, ip.retryAfter ?? 0, 1) }
}
