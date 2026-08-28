import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rateLimit: vi.fn(async () => ({ success: true })),
  relationships: vi.fn(),
  blocked: vi.fn(),
  profiles: vi.fn(),
  rpc: vi.fn(),
  legacyExisting: vi.fn(),
  legacyInsert: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    rpc: mocks.rpc,
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({ in: vi.fn(() => mocks.profiles()) })),
        }
      }
      return {
        select: vi.fn((columns: string) => columns === 'id, status'
          ? { or: vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: mocks.legacyExisting })) })) }
          : columns.includes('status')
            ? { or: vi.fn(() => ({ in: vi.fn(() => mocks.relationships()) })) }
          : { eq: vi.fn(() => ({ eq: vi.fn(() => mocks.blocked()) })) }),
        insert: vi.fn(() => mocks.legacyInsert()),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({ select: vi.fn(() => ({ single: mocks.update })) })),
            })),
          })),
        })),
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({
            or: vi.fn(() => ({
              select: vi.fn(() => ({ maybeSingle: mocks.remove })),
            })),
          })),
        })),
      }
    }),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({ check: mocks.rateLimit })),
}))

import { DELETE, GET, PATCH, POST } from '../route'

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/friends', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const VALID_UUID = '10000000-0000-4000-8000-000000000001'
const OTHER_UUID = '20000000-0000-4000-8000-000000000002'

describe('/api/friends', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rateLimit.mockResolvedValue({ success: true })
    mocks.relationships.mockResolvedValue({ data: [], error: null })
    mocks.blocked.mockResolvedValue({ data: [], error: null })
    mocks.profiles.mockResolvedValue({ data: [], error: null })
    mocks.rpc.mockResolvedValue({ data: 'sent', error: null })
    mocks.legacyExisting.mockResolvedValue({ data: null, error: null })
    mocks.legacyInsert.mockResolvedValue({ data: null, error: null })
    mocks.update.mockResolvedValue({ data: { id: VALID_UUID }, error: null })
    mocks.remove.mockResolvedValue({ data: { id: VALID_UUID }, error: null })
  })

  it('GET yetkisiz kullaniciyi reddeder', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    expect((await GET()).status).toBe(401)
  })

  it('GET kabul edilmis arkadas istatistiklerini visibility kapsaminda dondurur', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    mocks.relationships.mockResolvedValue({
      data: [{ id: 'f1', status: 'accepted', created_at: 'now', user_id: VALID_UUID, friend_id: OTHER_UUID }],
      error: null,
    })
    mocks.profiles.mockResolvedValue({
      data: [{ id: OTHER_UUID, username: 'dost', avatar_url: null, total_xp: 120, current_streak: 4, profile_visibility: 'friends' }],
      error: null,
    })

    const response = await GET()
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.friends[0].profile).toMatchObject({ username: 'dost', total_xp: 120, current_streak: 4 })
  })

  it('GET private profil ve pending iliskide istatistikleri maskeler', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    mocks.relationships.mockResolvedValue({
      data: [{ id: 'f1', status: 'pending', created_at: 'now', user_id: VALID_UUID, friend_id: OTHER_UUID }],
      error: null,
    })
    mocks.profiles.mockResolvedValue({
      data: [{ id: OTHER_UUID, username: 'gizli', avatar_url: null, total_xp: 999, current_streak: 99, profile_visibility: 'private' }],
      error: null,
    })

    const body = await (await GET()).json()
    expect(body.pendingSent[0].profile).toMatchObject({ username: 'gizli', total_xp: 0, current_streak: 0 })
  })

  it('GET service sorgu hatasini bos liste gibi gizlemez', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    mocks.relationships.mockResolvedValue({ data: null, error: { code: '42501' } })
    expect((await GET()).status).toBe(500)
  })

  it('POST atomik RPC ile istek gonderir', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    const response = await POST(makeRequest({ friendId: OTHER_UUID }))
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('request_friendship', {
      p_requester: VALID_UUID,
      p_target: OTHER_UUID,
    })
  })

  it.each([
    ['blocked', 403],
    ['accepted', 409],
    ['pending', 409],
    ['not_found', 404],
  ])('POST RPC %s sonucunu uygun HTTP durumuna cevirir', async (result, status) => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    mocks.rpc.mockResolvedValue({ data: result, error: null })
    expect((await POST(makeRequest({ friendId: OTHER_UUID }))).status).toBe(status)
  })

  it('POST migration 186 oncesinde yalniz missing-RPC hatasinda rollout fallback kullanir', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } })

    const response = await POST(makeRequest({ friendId: OTHER_UUID }))
    expect(response.status).toBe(200)
    expect(mocks.legacyExisting).toHaveBeenCalled()
    expect(mocks.legacyInsert).toHaveBeenCalled()
  })

  it('POST gecersiz uuid ve kendine istegi reddeder', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    expect((await POST(makeRequest({ friendId: 'bad' }))).status).toBe(400)
    expect((await POST(makeRequest({ friendId: VALID_UUID }))).status).toBe(400)
  })

  it('mutasyonlari rate limit ile korur', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    mocks.rateLimit.mockResolvedValueOnce({ success: false } as never)
    expect((await POST(makeRequest({ friendId: OTHER_UUID }))).status).toBe(429)
  })

  it('PATCH yalniz alici kosullu update basariliysa kabul eder', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    expect((await PATCH(makeRequest({ friendshipId: OTHER_UUID }))).status).toBe(200)
  })

  it('PATCH etkilenen satir yoksa 404 doner', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    mocks.update.mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
    expect((await PATCH(makeRequest({ friendshipId: OTHER_UUID }))).status).toBe(404)
  })

  it('DELETE actor olmayan veya bulunmayan iliskiyi 404 ile reddeder', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    mocks.remove.mockResolvedValue({ data: null, error: null })
    expect((await DELETE(makeRequest({ friendshipId: OTHER_UUID }))).status).toBe(404)
  })
})
