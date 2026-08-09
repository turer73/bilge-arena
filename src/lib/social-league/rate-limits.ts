import { createRateLimiter } from '@/lib/utils/rate-limit'

export const socialLeagueReadLimiter = createRateLimiter(
  'social-league-read-user',
  30,
  60_000,
)

export const socialLeaguePreferenceLimiter = createRateLimiter(
  'social-league-preference-user',
  10,
  60_000,
)
