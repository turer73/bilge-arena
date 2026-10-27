import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { verifyShareParams } from '@/lib/rooms/share-link'

const { mockAuth, mockFetchResult } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockFetchResult: vi.fn(),
}))

vi.mock('@/lib/rooms/api-helpers', () => ({ getAuthRateLimited: mockAuth }))
vi.mock('@/lib/rooms/server-fetch', () => ({ fetchShareableResult: mockFetchResult }))
vi.mock('@/lib/utils/rate-limit', () => ({ createRateLimiter: () => ({ check: vi.fn() }) }))

import { POST } from '../route'

const SECRET = 'test-share-secret-0123456789abcdef0123456789'
const ROOM = '3f2a9c1e-7b4d-4e8a-9c21-5d6e7f8a9b0c'

function call(id = ROOM) {
  return POST(new Request(`http://localhost/api/rooms/${id}/share-link`, { method: 'POST' }), { params: Promise.resolve({ id }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('SHARE_LINK_SECRET', SECRET)
  mockAuth.mockResolvedValue({ ok: true, userId: 'u1', jwt: 'jwt' })
  mockFetchResult.mockResolvedValue({ code: 'BLZGE2', title: 'Genel Kültür Gecesi', category: 'matematik', score: 850 })
})
afterEach(() => vi.unstubAllEnvs())

describe('POST /api/rooms/[id]/share-link', () => {
  it('oda-DB\'den okunan değerleri imzalayıp doğrulanabilir yol döndürür', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.json()
    expect(body.signed).toBe(true)
    const url = new URL(body.path, 'https://bilgearena.com')
    expect(url.pathname).toBe('/p/BLZGE2')
    expect(await verifyShareParams('BLZGE2', url.searchParams, SECRET)).toEqual({
      code: 'BLZGE2', title: 'Genel Kültür Gecesi', score: 850, category: 'matematik',
    })
    expect(mockFetchResult).toHaveBeenCalledWith('jwt', ROOM, 'u1')
  })

  it('sır tanımsızsa imzasız genel yol döndürür', async () => {
    vi.stubEnv('SHARE_LINK_SECRET', '')
    const body = await (await call()).json()
    expect(body).toEqual({ path: '/p/BLZGE2', signed: false })
  })

  it('oda tamamlanmamış, üye değil veya erişilemezse 404', async () => {
    mockFetchResult.mockResolvedValue(null)
    expect((await call()).status).toBe(404)
  })

  it('oturum yoksa yardımcı yanıtını aynen döndürür', async () => {
    mockAuth.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Yetkisiz' }, { status: 401 }) })
    expect((await call()).status).toBe(401)
    expect(mockFetchResult).not.toHaveBeenCalled()
  })
})
