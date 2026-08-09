import { createRateLimiter } from '@/lib/utils/rate-limit'

export const mockStrategyLifecycleLimiter = createRateLimiter(
  'mock-strategy-lifecycle-user',
  30,
  60_000,
)

export const mockStrategyEventLimiter = createRateLimiter(
  'mock-strategy-event-user',
  120,
  60_000,
)
