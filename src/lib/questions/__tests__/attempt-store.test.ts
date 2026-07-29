import { beforeEach, describe, expect, test, vi } from 'vitest'

vi.mock('@upstash/redis', () => ({ Redis: vi.fn() }))

describe('question attempt store memory fallback', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  test('ilk seçimi sabitler ve sonraki seçim onu değiştiremez', async () => {
    const store = await import('../attempt-store')
    expect(await store.recordFirstQuestionAttempt('user:u1', 'q1', -1)).toBe(-1)
    expect(await store.recordFirstQuestionAttempt('user:u1', 'q1', 2)).toBe(-1)
    expect(await store.getFirstQuestionAttempt('user:u1', 'q1')).toBe(-1)
  })

  test('actor ve soru anahtarları birbirinden ayrıdır', async () => {
    const store = await import('../attempt-store')
    await store.recordFirstQuestionAttempt('user:u2', 'q1', 1)
    await store.recordFirstQuestionAttempt('user:u2', 'q2', 2)
    expect(await store.getFirstQuestionAttempt('user:u2', 'q1')).toBe(1)
    expect(await store.getFirstQuestionAttempt('user:u2', 'q2')).toBe(2)
    expect(await store.getFirstQuestionAttempt('user:u3', 'q1')).toBeNull()
  })

  test('production ortamında Redis yoksa fail-closed davranır', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    vi.stubEnv('KV_REST_API_URL', '')
    vi.stubEnv('KV_REST_API_TOKEN', '')
    const store = await import('../attempt-store')

    await expect(store.recordFirstQuestionAttempt('user:u4', 'q1', 0))
      .rejects.toThrow('Question attempt store is not configured')
  })
})
