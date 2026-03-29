/**
 * Hybrid rate limiter: Upstash Redis varsa kullan, yoksa in-memory fallback.
 *
 * Production'da UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN env var'lari
 * set edilmeli. Yoksa in-memory limiter calismaya devam eder (burst korumasi).
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// ─── Redis-based rate limiter (production) ──────────────────

// Vercel Upstash entegrasyonu KV_REST_API_* isimleri kullanir,
// manuel kurulumda UPSTASH_REDIS_REST_* olabilir — ikisini de destekle
const redisUrl =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
const redisToken =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN

const hasRedis = !!(redisUrl && redisToken)

let redis: Redis | null = null

function getRedis(): Redis {
  if (!redis && hasRedis) {
    redis = new Redis({
      url: redisUrl!,
      token: redisToken!,
    })
  }
  return redis!
}

// ─── In-memory fallback (development / Redis yoksa) ─────────

interface RateLimitEntry {
  count: number
  resetAt: number
}

const stores = new Map<string, Map<string, RateLimitEntry>>()

// Eski kayitlari temizle (her 5 dk)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    stores.forEach((store) => {
      Array.from(store.entries()).forEach(([key, val]) => {
        if (now > val.resetAt) store.delete(key)
      })
    })
  }, 5 * 60_000)
}

function createInMemoryLimiter(name: string, limit: number, windowMs: number) {
  if (!stores.has(name)) {
    stores.set(name, new Map())
  }
  const store = stores.get(name)!

  return {
    async check(key: string): Promise<{ success: boolean; retryAfter?: number }> {
      const now = Date.now()
      const entry = store.get(key)

      if (!entry || now > entry.resetAt) {
        store.set(key, { count: 1, resetAt: now + windowMs })
        return { success: true }
      }

      if (entry.count >= limit) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
        return { success: false, retryAfter }
      }

      entry.count++
      return { success: true }
    },
  }
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Rate limiter olusturur.
 * Redis varsa Upstash sliding window, yoksa in-memory fixed window.
 *
 * @param name     - Limiter adi (her route icin farkli)
 * @param limit    - Pencere basina maksimum istek
 * @param windowMs - Pencere suresi (ms), default 60 saniye
 */
export function createRateLimiter(name: string, limit: number, windowMs = 60_000) {
  if (hasRedis) {
    const windowSec = Math.ceil(windowMs / 1000)
    const limiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
      prefix: `rl:${name}`,
    })

    return {
      async check(key: string): Promise<{ success: boolean; retryAfter?: number }> {
        const result = await limiter.limit(key)
        if (result.success) {
          return { success: true }
        }
        const retryAfter = Math.ceil((result.reset - Date.now()) / 1000)
        return { success: false, retryAfter: Math.max(1, retryAfter) }
      },
    }
  }

  // Fallback: in-memory
  return createInMemoryLimiter(name, limit, windowMs)
}
