import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRateLimiter } from '../rate-limit'

describe('createRateLimiter', () => {
  beforeEach(() => {
    // Her testte temiz bir limiter adi kullan
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('limit dahilinde success: true doner', async () => {
    const limiter = createRateLimiter('test-a', 3, 60_000)

    expect((await limiter.check('user1')).success).toBe(true)
    expect((await limiter.check('user1')).success).toBe(true)
    expect((await limiter.check('user1')).success).toBe(true)
  })

  it('limit asildiginda success: false doner', async () => {
    const limiter = createRateLimiter('test-b', 2, 60_000)

    await limiter.check('user1')
    await limiter.check('user1')

    const result = await limiter.check('user1')
    expect(result.success).toBe(false)
    expect(result.retryAfter).toBeGreaterThan(0)
  })

  it('farkli kullanicilar bagimsiz sayilir', async () => {
    const limiter = createRateLimiter('test-c', 1, 60_000)

    expect((await limiter.check('user1')).success).toBe(true)
    expect((await limiter.check('user2')).success).toBe(true)

    // user1 limit asildi ama user2 etkilenmez
    expect((await limiter.check('user1')).success).toBe(false)
  })

  it('pencere suresi dolunca sayac sifirlanir', async () => {
    const limiter = createRateLimiter('test-d', 1, 10_000) // 10 saniye

    expect((await limiter.check('user1')).success).toBe(true)
    expect((await limiter.check('user1')).success).toBe(false)

    // 11 saniye ileri sar
    vi.advanceTimersByTime(11_000)

    expect((await limiter.check('user1')).success).toBe(true)
  })

  it('retryAfter degeri saniye cinsinden doner', async () => {
    const limiter = createRateLimiter('test-e', 1, 60_000)

    await limiter.check('user1')
    const result = await limiter.check('user1')

    expect(result.retryAfter).toBeLessThanOrEqual(60)
    expect(result.retryAfter).toBeGreaterThan(0)
  })

  it('production ortaminda Redis yoksa in-memory yerine fail-closed davranir', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    vi.stubEnv('KV_REST_API_URL', '')
    vi.stubEnv('KV_REST_API_TOKEN', '')

    const limiter = createRateLimiter('test-production-fail-closed', 100, 60_000)
    const result = await limiter.check('user1')

    expect(result).toEqual({
      success: false,
      retryAfter: 60,
      reason: 'backend_unavailable',
    })
  })
})
