import { describe, it, expect, vi, beforeEach } from 'vitest'

// CRON_SECRET & RESEND_API_KEY modul basinda okundugu icin import'tan once set
const { mockEmailSend, mockProfilesRes, mockSessionsRes, mockXpLogRes } = vi.hoisted(() => {
  process.env.CRON_SECRET = 'test-secret-123'
  process.env.RESEND_API_KEY = 'test-resend-key'
  return {
    mockEmailSend: vi.fn(),
    mockProfilesRes: vi.fn(),
    mockSessionsRes: vi.fn(),
    mockXpLogRes: vi.fn(),
  }
})

vi.mock('resend', () => ({
  // new Resend(key) icin gercek constructor gerekli — class kullan
  Resend: class MockResend {
    emails = { send: mockEmailSend }
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            not: vi.fn(() => ({
              not: vi.fn(() => ({
                limit: vi.fn(() => mockProfilesRes()),
              })),
            })),
            in: vi.fn(() => mockProfilesRes()),
          })),
        }
      }
      if (table === 'game_sessions') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              eq: vi.fn(() => ({
                gte: vi.fn(() => mockSessionsRes()),
              })),
            })),
          })),
        }
      }
      if (table === 'xp_log') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => ({
              gte: vi.fn(() => mockXpLogRes()),
            })),
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
  return new Request('http://localhost/api/cron/weekly-digest', { headers })
}

describe('GET /api/cron/weekly-digest', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 if authorization header missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 401 if wrong secret', async () => {
    const res = await GET(makeRequest('Bearer wrong-secret'))
    expect(res.status).toBe(401)
  })

  it('rejects secret with Bearer prefix missing', async () => {
    const res = await GET(makeRequest('test-secret-123'))
    expect(res.status).toBe(401)
  })

  it('rejects empty authorization', async () => {
    const res = await GET(makeRequest(''))
    expect(res.status).toBe(401)
  })
})
