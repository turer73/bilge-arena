import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRateLimiter } from '../rate-limit'

describe('createRateLimiter', () => {
  beforeEach(() => {
    // Her testte temiz bir limiter adi kullan
    vi.useFakeTimers()
  })

  it('limit dahilinde success: true doner', () => {
    const limiter = createRateLimiter('test-a', 3, 60_000)

    expect(limiter.check('user1').success).toBe(true)
    expect(limiter.check('user1').success).toBe(true)
    expect(limiter.check('user1').success).toBe(true)
  })

  it('limit asildiginda success: false doner', () => {
    const limiter = createRateLimiter('test-b', 2, 60_000)

    limiter.check('user1')
    limiter.check('user1')

    const result = limiter.check('user1')
    expect(result.success).toBe(false)
    expect(result.retryAfter).toBeGreaterThan(0)
  })

  it('farkli kullanicilar bagimsiz sayilir', () => {
    const limiter = createRateLimiter('test-c', 1, 60_000)

    expect(limiter.check('user1').success).toBe(true)
    expect(limiter.check('user2').success).toBe(true)

    // user1 limit asildi ama user2 etkilenmez
    expect(limiter.check('user1').success).toBe(false)
  })

  it('pencere suresi dolunca sayac sifirlanir', () => {
    const limiter = createRateLimiter('test-d', 1, 10_000) // 10 saniye

    expect(limiter.check('user1').success).toBe(true)
    expect(limiter.check('user1').success).toBe(false)

    // 11 saniye ileri sar
    vi.advanceTimersByTime(11_000)

    expect(limiter.check('user1').success).toBe(true)
  })

  it('retryAfter degeri saniye cinsinden doner', () => {
    const limiter = createRateLimiter('test-e', 1, 60_000)

    limiter.check('user1')
    const result = limiter.check('user1')

    expect(result.retryAfter).toBeLessThanOrEqual(60)
    expect(result.retryAfter).toBeGreaterThan(0)
  })
})
