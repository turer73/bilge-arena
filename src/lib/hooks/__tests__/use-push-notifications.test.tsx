/**
 * Bilge Arena: usePushNotifications — abonelik durum makinesi.
 * unsupported/denied/prompt/subscribed geçişleri + subscribe/unsubscribe
 * akışları (SW + PushManager + Notification mock'lu).
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// VAPID modul basinda okunur — import'tan once set (repo cron-test paterni)
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'QUJDREVGR0g' // base64url 'ABCDEFGH'
})

const authState = vi.hoisted(() => ({ value: { user: { id: 'u1' } as { id: string } | null } }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => authState.value }))

import { usePushNotifications } from '../use-push-notifications'

const fetchMock = vi.fn()
global.fetch = fetchMock as unknown as typeof fetch

// --- Tarayıcı API mock'ları ---
const pushSub = {
  endpoint: 'https://push.example/ep1',
  toJSON: () => ({ endpoint: 'https://push.example/ep1', keys: { p256dh: 'p', auth: 'a' } }),
  unsubscribe: vi.fn(() => Promise.resolve(true)),
}
const pushManager = {
  getSubscription: vi.fn(),
  subscribe: vi.fn(),
}
const swReady = Promise.resolve({ pushManager })

function setupBrowserEnv(opts: { sw?: boolean; permission?: NotificationPermission } = {}) {
  const { sw = true, permission = 'default' } = opts
  if (sw) {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: swReady },
      configurable: true,
    })
  } else {
    // @ts-expect-error - jsdom'da silinebilir
    delete navigator.serviceWorker
  }
  ;(globalThis as Record<string, unknown>).PushManager = sw ? function PushManager() {} : undefined
  if (!sw) delete (globalThis as Record<string, unknown>).PushManager
  ;(globalThis as Record<string, unknown>).Notification = {
    permission,
    requestPermission: vi.fn(() => Promise.resolve(permission === 'default' ? 'granted' : permission)),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  authState.value = { user: { id: 'u1' } }
  pushManager.getSubscription.mockResolvedValue(null)
  pushManager.subscribe.mockResolvedValue(pushSub)
  fetchMock.mockResolvedValue({ ok: true })
  setupBrowserEnv()
})

describe('usePushNotifications', () => {
  test('serviceWorker/PushManager yoksa: unsupported', async () => {
    setupBrowserEnv({ sw: false })
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.status).toBe('unsupported'))
  })

  test('izin denied: status denied', async () => {
    setupBrowserEnv({ permission: 'denied' })
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.status).toBe('denied'))
  })

  test('abonelik mevcut: subscribed', async () => {
    pushManager.getSubscription.mockResolvedValue(pushSub)
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.status).toBe('subscribed'))
  })

  test('abonelik yok: prompt', async () => {
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.status).toBe('prompt'))
  })

  test('subscribe: izin granted → pushManager.subscribe + POST /api/push → subscribed', async () => {
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.status).toBe('prompt'))

    let ok = false
    await act(async () => { ok = await result.current.subscribe() })
    expect(ok).toBe(true)
    expect(pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    )
    expect(fetchMock).toHaveBeenCalledWith('/api/push', expect.objectContaining({ method: 'POST' }))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toEqual({ endpoint: 'https://push.example/ep1', p256dh: 'p', auth: 'a' })
    expect(result.current.status).toBe('subscribed')
  })

  test('subscribe: kullanıcı izni reddederse false + denied', async () => {
    ;(globalThis as Record<string, unknown>).Notification = {
      permission: 'default',
      requestPermission: vi.fn(() => Promise.resolve('denied')),
    }
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.status).toBe('prompt'))

    let ok = true
    await act(async () => { ok = await result.current.subscribe() })
    expect(ok).toBe(false)
    expect(result.current.status).toBe('denied')
    expect(pushManager.subscribe).not.toHaveBeenCalled()
  })

  test('subscribe: misafir kullanıcıda hiçbir şey yapmaz', async () => {
    authState.value = { user: null }
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.status).toBe('prompt'))
    let ok = true
    await act(async () => { ok = await result.current.subscribe() })
    expect(ok).toBe(false)
    expect(pushManager.subscribe).not.toHaveBeenCalled()
  })

  test('unsubscribe: DELETE /api/push + sub.unsubscribe → prompt', async () => {
    pushManager.getSubscription.mockResolvedValue(pushSub)
    const { result } = renderHook(() => usePushNotifications())
    await waitFor(() => expect(result.current.status).toBe('subscribed'))

    await act(async () => { await result.current.unsubscribe() })
    expect(fetchMock).toHaveBeenCalledWith('/api/push', expect.objectContaining({ method: 'DELETE' }))
    expect(pushSub.unsubscribe).toHaveBeenCalled()
    expect(result.current.status).toBe('prompt')
  })
})
