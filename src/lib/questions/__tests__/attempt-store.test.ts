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

  test('çoklu okuma her sorunun ilk seçimini, notlanmamış soruya null döner', async () => {
    const store = await import('../attempt-store')
    await store.recordFirstQuestionAttempt('attempt:a1', 'q1', 2)
    await store.recordFirstQuestionAttempt('attempt:a1', 'q3', -1)
    const attempts = await store.getFirstQuestionAttempts('attempt:a1', ['q1', 'q2', 'q3'])
    expect([...attempts]).toEqual([['q1', 2], ['q2', null], ['q3', -1]])
  })

  test('Redis varken çoklu okuma tek MGET ile yapılır', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.test')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token')
    const mget = vi.fn().mockResolvedValue([1, null, '0', 'bozuk'])
    const { Redis } = await import('@upstash/redis')
    vi.mocked(Redis).mockImplementation(function MockRedis() { return { mget } } as never)
    const store = await import('../attempt-store')

    const attempts = await store.getFirstQuestionAttempts('attempt:a2', ['q1', 'q2', 'q3', 'q4'])

    expect(mget).toHaveBeenCalledOnce()
    expect(mget).toHaveBeenCalledWith(
      'question-attempt:v1:attempt:a2:q1',
      'question-attempt:v1:attempt:a2:q2',
      'question-attempt:v1:attempt:a2:q3',
      'question-attempt:v1:attempt:a2:q4',
    )
    expect([...attempts]).toEqual([['q1', 1], ['q2', null], ['q3', 0], ['q4', null]])
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
