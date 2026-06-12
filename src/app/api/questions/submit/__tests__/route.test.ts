/**
 * Bilge Arena: POST /api/questions/submit — UGC gönderim endpoint'i.
 * RL sırası (IP → auth → user-RL), validation, insert, hata yolları.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockIpCheck, mockUserCheck, mockGetUser, mockInsert } = vi.hoisted(() => ({
  mockIpCheck: vi.fn(),
  mockUserCheck: vi.fn(),
  mockGetUser: vi.fn(),
  mockInsert: vi.fn(),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: (name: string) => ({
    check: name.includes('-ip') ? mockIpCheck : mockUserCheck,
  }),
}))
vi.mock('@/lib/utils/client-ip', () => ({ getClientIp: () => '1.2.3.4' }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      insert: (row: unknown) => {
        mockInsert(row)
        return { select: () => ({ single: () => Promise.resolve({ data: { id: 'sub-1' }, error: null }) }) }
      },
    }),
  }),
}))

import { POST } from '../route'

const VALID_BODY = {
  game: 'matematik',
  category: 'problemler',
  difficulty: 3,
  question: 'Bir sayının %20 fazlası 60 ise sayı kaçtır?',
  options: ['40', '50', '48', '52'],
  answer: 1,
}

function req(body: unknown) {
  return new Request('http://localhost/api/questions/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never
}

beforeEach(() => {
  vi.clearAllMocks()
  mockIpCheck.mockResolvedValue({ success: true })
  mockUserCheck.mockResolvedValue({ success: true })
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
})

describe('POST /api/questions/submit', () => {
  it('IP limiti auth\'tan ÖNCE çalışır (Auth quota koruması)', async () => {
    mockIpCheck.mockResolvedValue({ success: false, retryAfter: 60 })
    const res = await POST(req(VALID_BODY))
    expect(res.status).toBe(429)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('misafir: 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(req(VALID_BODY))
    expect(res.status).toBe(401)
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('user-RL aşımı: 429 + Retry-After', async () => {
    mockUserCheck.mockResolvedValue({ success: false, retryAfter: 1800 })
    const res = await POST(req(VALID_BODY))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('1800')
  })

  it('geçersiz gövde: 400 + validation mesajı', async () => {
    const res = await POST(req({ ...VALID_BODY, answer: 9 }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('Doğru cevap')
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('geçerli gönderim: 201 + pending + user_id bağlanır', async () => {
    const res = await POST(req(VALID_BODY))
    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data).toEqual({ status: 'pending', id: 'sub-1' })
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'u1',
        game: 'matematik',
        content: expect.objectContaining({ answer: 1, options: VALID_BODY.options }),
      }),
    )
  })
})
