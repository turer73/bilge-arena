import { createRateLimiter } from '@/lib/utils/rate-limit'

export const paperPackIssueLimiter = createRateLimiter('paper-pack-issue-user', 5, 60_000)
export const paperPackReadLimiter = createRateLimiter('paper-pack-read-user', 30, 60_000)
export const paperPackSubmitLimiter = createRateLimiter('paper-pack-submit-user', 10, 60_000)
