import { describe, expect, it } from 'vitest'
import { withFetchTimeout } from '../fetch-timeout'

// Yanıt vermeyen bir yukarı akış: yalnız sinyal iptal edilince reddeder.
const hangingFetch: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
  init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
})

describe('withFetchTimeout', () => {
  it('aborts a hanging upstream after the timeout', async () => {
    const started = Date.now()
    await expect(withFetchTimeout(30, hangingFetch)('https://example.test'))
      .rejects.toMatchObject({ name: 'TimeoutError' })
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it('keeps the caller signal: an earlier caller abort still wins', async () => {
    const controller = new AbortController()
    const pending = withFetchTimeout(5_000, hangingFetch)('https://example.test', { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('passes the request through unchanged otherwise', async () => {
    const seen: RequestInit[] = []
    const okFetch: typeof fetch = async (_input, init) => {
      seen.push(init ?? {})
      return new Response('ok')
    }
    const response = await withFetchTimeout(1_000, okFetch)('https://example.test', {
      method: 'POST',
      headers: { apikey: 'x' },
    })
    expect(await response.text()).toBe('ok')
    expect(seen[0]).toMatchObject({ method: 'POST', headers: { apikey: 'x' } })
    expect(seen[0].signal).toBeInstanceOf(AbortSignal)
  })
})
