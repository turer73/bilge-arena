import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sentry = vi.hoisted(() => ({
  captureCheckIn: vi.fn(() => 'check-in-1'),
  captureMessage: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(async () => true),
}))
vi.mock('@sentry/nextjs', () => sentry)

import { withCronMonitor } from '../cron-monitor'

const authorized = () => new Request('https://bilgearena.com/api/cron/x', {
  headers: { authorization: 'Bearer cron-secret' },
})

describe('withCronMonitor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CRON_SECRET', 'cron-secret')
    vi.stubEnv('SENTRY_CRON_MONITORS', '')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not monitor an unauthorized call', async () => {
    const handler = vi.fn(async () => new Response('no', { status: 401 }))
    const response = await withCronMonitor('x', '0 9 * * 1', handler)(
      new Request('https://bilgearena.com/api/cron/x', { headers: { authorization: 'Bearer wrong' } }),
    )
    expect(response.status).toBe(401)
    expect(handler).toHaveBeenCalledOnce()
    expect(sentry.captureMessage).not.toHaveBeenCalled()
    expect(sentry.captureCheckIn).not.toHaveBeenCalled()
  })

  it('raises a cron-tagged alarm when the run fails with 5xx', async () => {
    const response = await withCronMonitor('weekly-digest', '0 9 * * 1', async () => new Response('x', { status: 500 }))(authorized())
    expect(response.status).toBe(500)
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      '[cron:weekly-digest] failed with HTTP 500',
      { level: 'error', tags: { cron: 'weekly-digest' } },
    )
    expect(sentry.flush).toHaveBeenCalled()
  })

  it('captures and rethrows an exception', async () => {
    const boom = new Error('boom')
    await expect(withCronMonitor('x', '0 9 * * 1', async () => { throw boom })(authorized())).rejects.toBe(boom)
    expect(sentry.captureException).toHaveBeenCalledWith(boom, { tags: { cron: 'x' } })
  })

  it('stays quiet on success and on the declared disabled status', async () => {
    await withCronMonitor('x', '0 9 * * 1', async () => new Response('ok'))(authorized())
    await withCronMonitor('x', '0 9 * * 1', async () => new Response('off', { status: 503 }), { disabledStatus: 503 })(authorized())
    expect(sentry.captureMessage).not.toHaveBeenCalled()
    expect(sentry.captureCheckIn).not.toHaveBeenCalled()
  })

  it('sends Sentry Crons check-ins only when explicitly enabled', async () => {
    vi.stubEnv('SENTRY_CRON_MONITORS', '1')
    await withCronMonitor('honeypot-check', '0 */6 * * *', async () => new Response('ok'))(authorized())
    expect(sentry.captureCheckIn).toHaveBeenNthCalledWith(
      1,
      { monitorSlug: 'honeypot-check', status: 'in_progress' },
      expect.objectContaining({ schedule: { type: 'crontab', value: '0 */6 * * *' }, timezone: 'Etc/UTC' }),
    )
    expect(sentry.captureCheckIn).toHaveBeenNthCalledWith(
      2,
      { checkInId: 'check-in-1', monitorSlug: 'honeypot-check', status: 'ok' },
    )

    sentry.captureCheckIn.mockClear()
    await withCronMonitor('honeypot-check', '0 */6 * * *', async () => new Response('x', { status: 500 }))(authorized())
    expect(sentry.captureCheckIn).toHaveBeenLastCalledWith(
      { checkInId: 'check-in-1', monitorSlug: 'honeypot-check', status: 'error' },
    )
  })
})
