import { describe, it, expect, vi, beforeEach } from 'vitest'

// CRON_SECRET modul basinda okundugu icin import'tan once set
const { mockSendPush, mockProfilesRes, mockSubscriptionsRes } = vi.hoisted(() => {
  process.env.CRON_SECRET = 'test-secret-123'
  return {
    mockSendPush: vi.fn(),
    mockProfilesRes: vi.fn(),
    mockSubscriptionsRes: vi.fn(),
  }
})

vi.mock('@/lib/utils/push', () => ({
  sendPushNotification: mockSendPush,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            gte: vi.fn(() => ({
              gte: vi.fn(() => ({
                lt: vi.fn(() => mockProfilesRes()),
              })),
            })),
          })),
        }
      }
      if (table === 'push_subscriptions') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => mockSubscriptionsRes()),
          })),
        }
      }
      return {}
    }),
  })),
}))

import { GET } from '../route'

function makeRequest(auth?: string) {
  const headers = new Headers()
  if (auth) headers.set('authorization', auth)
  return new Request('http://localhost/api/cron/daily-streak-reminder', { headers })
}

describe('GET /api/cron/daily-streak-reminder', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if authorization header missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 401 if wrong secret', async () => {
    const res = await GET(makeRequest('Bearer wrong-secret'))
    expect(res.status).toBe(401)
  })

  it('returns 0 sent when no eligible profiles', async () => {
    mockProfilesRes.mockResolvedValueOnce({ data: [], error: null })
    const res = await GET(makeRequest('Bearer test-secret-123'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ sent: 0, candidates: 0 })
    expect(mockSendPush).not.toHaveBeenCalled()
  })

  it('returns 500 if profile query errors', async () => {
    mockProfilesRes.mockResolvedValueOnce({ data: null, error: { message: 'db down' } })
    const res = await GET(makeRequest('Bearer test-secret-123'))
    expect(res.status).toBe(500)
  })

  it('returns 0 sent when profiles exist but no subscriptions', async () => {
    mockProfilesRes.mockResolvedValueOnce({
      data: [{ id: 'u1', display_name: 'A', current_streak: 5 }],
      error: null,
    })
    mockSubscriptionsRes.mockResolvedValueOnce({ data: [], error: null })
    const res = await GET(makeRequest('Bearer test-secret-123'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ sent: 0, candidates: 1 })
    expect(mockSendPush).not.toHaveBeenCalled()
  })

  it('sends push to subscribers with streak >= 1', async () => {
    mockProfilesRes.mockResolvedValueOnce({
      data: [
        { id: 'u1', display_name: 'A', current_streak: 5 },
        { id: 'u2', display_name: 'B', current_streak: 1 },
      ],
      error: null,
    })
    mockSubscriptionsRes.mockResolvedValueOnce({
      data: [
        { user_id: 'u1', endpoint: 'https://e1', p256dh: 'k1', auth: 'a1' },
        { user_id: 'u2', endpoint: 'https://e2', p256dh: 'k2', auth: 'a2' },
      ],
      error: null,
    })
    mockSendPush.mockResolvedValue(true)

    const res = await GET(makeRequest('Bearer test-secret-123'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ sent: 2, candidates: 2, subscriptions: 2 })
    expect(mockSendPush).toHaveBeenCalledTimes(2)

    // U1 streak=5 mesaji icerir
    const u1Call = mockSendPush.mock.calls.find(
      ([sub]) => (sub as { endpoint: string }).endpoint === 'https://e1',
    )
    expect(u1Call?.[1]).toMatchObject({
      title: 'Bilge Arena',
      body: expect.stringContaining('5 gunluk'),
      url: '/arena',
    })
  })

  it('skips invalid subscriptions (sendPushNotification returns false)', async () => {
    mockProfilesRes.mockResolvedValueOnce({
      data: [{ id: 'u1', display_name: 'A', current_streak: 3 }],
      error: null,
    })
    mockSubscriptionsRes.mockResolvedValueOnce({
      data: [
        { user_id: 'u1', endpoint: 'https://e1', p256dh: 'k1', auth: 'a1' },
        { user_id: 'u1', endpoint: 'https://expired', p256dh: 'k2', auth: 'a2' },
      ],
      error: null,
    })
    mockSendPush.mockResolvedValueOnce(true).mockResolvedValueOnce(false)

    const res = await GET(makeRequest('Bearer test-secret-123'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sent).toBe(1)
    expect(body.subscriptions).toBe(2)
  })
})
