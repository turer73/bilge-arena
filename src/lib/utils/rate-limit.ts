/**
 * Basit in-memory rate limiter.
 * Production'da Redis (Upstash) ile degistirilmeli.
 *
 * Not: Vercel Serverless'ta her cold start Map sifirlanir,
 * ama ayni instance birden fazla request servis eder —
 * bu yuzden burst saldirilarini onler.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const stores = new Map<string, Map<string, RateLimitEntry>>()

// Eski kayitlari temizle (her 5 dk)
setInterval(() => {
  const now = Date.now()
  stores.forEach((store) => {
    Array.from(store.entries()).forEach(([key, val]) => {
      if (now > val.resetAt) store.delete(key)
    })
  })
}, 5 * 60_000)

/**
 * Rate limiter olusturur.
 * @param name  - Limiter adi (her route icin farkli store)
 * @param limit - Pencere basina maksimum istek
 * @param windowMs - Pencere suresi (ms), default 60 saniye
 */
export function createRateLimiter(name: string, limit: number, windowMs = 60_000) {
  if (!stores.has(name)) {
    stores.set(name, new Map())
  }
  const store = stores.get(name)!

  return {
    /**
     * Istegi kontrol eder.
     * @returns { success: true } veya { success: false, retryAfter }
     */
    check(key: string): { success: boolean; retryAfter?: number } {
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
