import { describe, expect, it, vi } from 'vitest'

const sendNotification = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification } }))

import { isAllowedPushEndpoint } from '../push-endpoint'

describe('isAllowedPushEndpoint', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc:def',
    'https://updates.push.services.mozilla.com/wpush/v2/gAAAA',
    'https://web.push.apple.com/QGuQyavXutnMPfh',
    'https://wns2-par02p.notify.windows.com/w/?token=abc',
    'https://FCM.GoogleAPIs.com/fcm/send/abc',
  ])('accepts the browser push service %s', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true)
  })

  it.each([
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com:8443/fcm/send/abc',
    'https://user:pass@fcm.googleapis.com/fcm/send/abc',
    'https://localhost/push',
    'https://127.0.0.1/push',
    'https://169.254.169.254/latest/meta-data',
    'https://fcm.googleapis.com.evil.example/push',
    'https://evilfcm.googleapis.com/push',
    'https://notify.windows.com.evil.example/push',
    'https://bilgearena.com/api/admin',
    'not a url',
  ])('rejects %s', (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false)
  })
})

describe('sendPushNotification endpoint guard', () => {
  it('never sends to an address that is not a push service, even if it reached the table', async () => {
    vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'public')
    vi.stubEnv('VAPID_PRIVATE_KEY', 'private')
    vi.resetModules()
    const { sendPushNotification } = await import('../push')
    const result = await sendPushNotification(
      { endpoint: 'https://169.254.169.254/latest/meta-data', p256dh: 'k', auth: 'a' },
      { title: 'Bilge Arena', body: 'x' },
    )
    expect(result).toBe('rejected')
    expect(sendNotification).not.toHaveBeenCalled()

    expect(await sendPushNotification(
      { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: 'k', auth: 'a' },
      { title: 'Bilge Arena', body: 'x', url: '/arena' },
    )).toBe('sent')
    expect(sendNotification).toHaveBeenCalledOnce()
    vi.unstubAllEnvs()
  })
})
