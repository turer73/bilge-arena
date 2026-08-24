/**
 * Hybrid rate limiter: Upstash Redis varsa kullan, yalnizca development/test
 * ortaminda in-memory fallback'e izin ver.
 *
 * Production'da KV_REST_API_URL + KV_REST_API_TOKEN env var'lari
 * set edilmelidir. Production'da eksik/erisilemez Redis fail-closed davranir.
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// ─── Redis — lazy initialization ────────────────────────────
// Env var'lar module load sirasinda erisilemeyebilir (serverless cold start)
// Bu yuzden her erisimde kontrol ediyoruz.

let redis: Redis | null = null
let redisChecked = false

function getRedis(): Redis | null {
  if (redisChecked) return redis

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN

  if (url && token) {
    redis = new Redis({ url, token })
  }
  redisChecked = true
  return redis
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

export type RateLimitResult = {
  success: boolean
  retryAfter?: number
  reason?: 'limit_exceeded' | 'backend_unavailable'
}

// Limiter cache — Ratelimit instance'larini yeniden olusturma
const redisLimiterCache = new Map<string, Ratelimit>()
const memoryLimiterCache = new Map<string, ReturnType<typeof createInMemoryLimiter>>()

/**
 * Rate limiter olusturur.
 * Redis varsa Upstash sliding window, yoksa in-memory fixed window.
 *
 * @param name     - Limiter adi (her route icin farkli)
 * @param limit    - Pencere basina maksimum istek
 * @param windowMs - Pencere suresi (ms), default 60 saniye
 */
export function createRateLimiter(name: string, limit: number, windowMs = 60_000) {
  return {
    async check(key: string): Promise<RateLimitResult> {
      const redisClient = getRedis()

      if (redisClient) {
        // Cache Ratelimit instance — her check()'te yeni oluşturmak counter'ı sıfırlar
        if (!redisLimiterCache.has(name)) {
          const windowSec = Math.ceil(windowMs / 1000)
          redisLimiterCache.set(name, new Ratelimit({
            redis: redisClient,
            limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
            prefix: `rl:${name}`,
          }))
        }
        try {
          const limiter = redisLimiterCache.get(name)!
          const result = await limiter.limit(key)
          if (result.success) {
            return { success: true }
          }
          const retryAfter = Math.ceil((result.reset - Date.now()) / 1000)
          return {
            success: false,
            retryAfter: Math.max(1, retryAfter),
            reason: 'limit_exceeded',
          }
        } catch (error) {
          console.error('[rate-limit] Redis erisilemez; production istegi fail-closed reddedildi.', {
            limiter: name,
            error: error instanceof Error ? error.message : 'unknown',
          })
          if (process.env.NODE_ENV === 'production') {
            return { success: false, retryAfter: 60, reason: 'backend_unavailable' }
          }
        }
      }

      if (process.env.NODE_ENV === 'production') {
        console.error('[rate-limit] Redis yapilandirmasi yok; production istegi fail-closed reddedildi.', {
          limiter: name,
        })
        return { success: false, retryAfter: 60, reason: 'backend_unavailable' }
      }

      // In-memory yalnizca development/test fallback'idir.
      if (!memoryLimiterCache.has(name)) {
        memoryLimiterCache.set(name, createInMemoryLimiter(name, limit, windowMs))
      }
      return memoryLimiterCache.get(name)!.check(key)
    },
  }
}
