/**
 * Bilge Arena Oda: /api/og/result/[code] route smoke tests
 * Sprint 2C Task 8 PR2 (PR #63 follow-up)
 *
 * NOT: Edge runtime ImageResponse PNG buffer doner. Vitest happy-dom
 * environment'inde gerçek render simulasyonu zor — sadece basit smoke test:
 * route fonksiyonu hata atmadan çağrılabilir mi.
 *
 * Manuel test (Vercel preview):
 *   /api/og/result/ABC123?title=Test%20Oda&score=850&category=matematik
 *   1200x630 PNG döner, mobil cihazlarda OG card preview gösterir.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'

const SECRET = 'test-share-secret-0123456789abcdef0123456789'
afterEach(() => vi.unstubAllEnvs())

// next/og ImageResponse mock (gerçek satori render gereksiz, smoke test)
// `new ImageResponse(jsx, opts)` constructor kullanildigi icin class mock
vi.mock('next/og', () => ({
  ImageResponse: class MockImageResponse {
    status = 200
    headers = new Map([['content-type', 'image/png']])
    _opts: unknown
    _jsx: unknown
    _jsxRendered = true
    constructor(jsx: unknown, opts: unknown) {
      this._jsx = jsx
      this._opts = opts
    }
  },
}))

// Inter-Bold.woff fetch mock (CDN cached)
// Codex P1 fix: getInterBold res.ok check eder, mock ok=true zorunlu
const mockFetch = vi.fn()
beforeEach(() => {
  vi.resetModules() // module-level interBoldPromise reset
  globalThis.fetch = mockFetch as unknown as typeof fetch
  mockFetch.mockReset()
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  })
})

describe('/api/og/result/[code] route', () => {
  test('1) GET response: ImageResponse 1200x630 PNG (default title)', async () => {
    const { GET } = await import('../route')
    const request = new Request(
      'https://bilgearena.com/api/og/result/ABC123',
    ) as unknown as Parameters<typeof GET>[0]
    const params = Promise.resolve({ code: 'ABC123' })
    const res = (await GET(request, { params })) as unknown as {
      _opts: { width: number; height: number; fonts: unknown[] }
    }
    expect(res._opts.width).toBe(1200)
    expect(res._opts.height).toBe(630)
    expect(res._opts.fonts).toHaveLength(1)
  })

  // disc #2950: yalniz imzali degerler cizilir; imzasiz URL metni karta girmez.
  test('2) imzasiz title/score/category cizilmez, genel kart cizilir', async () => {
    vi.stubEnv('SHARE_LINK_SECRET', SECRET)
    const { GET } = await import('../route')
    for (const query of ['title=SAHTE&score=999&category=matematik', 'og_title=SAHTE&og_score=999&og_category=matematik']) {
      const request = new Request(`https://bilgearena.com/api/og/result/BLZGE2?${query}`) as unknown as Parameters<typeof GET>[0]
      const res = (await GET(request, { params: Promise.resolve({ code: 'BLZGE2' }) })) as unknown as { _jsx: unknown }
      const text = JSON.stringify(res._jsx)
      expect(text, query).toContain('Bilge Arena Yarışması')
      expect(text, query).not.toContain('SAHTE')
      expect(text, query).not.toContain('999')
    }
  })

  test('3) imzali title, score ve category cizilir', async () => {
    vi.stubEnv('SHARE_LINK_SECRET', SECRET)
    const { signShareClaims } = await import('@/lib/rooms/share-link')
    const signed = await signShareClaims({ code: 'BLZGE2', title: 'Genel Kultur Gecesi', score: 850, category: 'matematik' }, SECRET)
    const { GET } = await import('../route')
    const request = new Request(`https://bilgearena.com/api/og/result/BLZGE2?${signed!.toString()}`) as unknown as Parameters<typeof GET>[0]
    const res = (await GET(request, { params: Promise.resolve({ code: 'BLZGE2' }) })) as unknown as { _jsx: unknown }
    const text = JSON.stringify(res._jsx)
    expect(text).toContain('Genel Kultur Gecesi')
    expect(text).toContain('850')
    expect(text).toContain('Kategori: matematik')
  })

  test('4) Inter-Bold.woff fetch ilk cagri', async () => {
    const { GET } = await import('../route')
    const request = new Request(
      'https://bilgearena.com/api/og/result/X',
    ) as unknown as Parameters<typeof GET>[0]
    const params = Promise.resolve({ code: 'X' })
    await GET(request, { params })
    const fontCalls = mockFetch.mock.calls.filter((c) =>
      String(c[0]).includes('Inter-Bold.woff'),
    )
    expect(fontCalls.length).toBe(1)
  })

  test('5) Codex P1 fix: font fetch fail (500) -> error throw + cache reset', async () => {
    const { GET } = await import('../route')

    // 1. cagri: 500 fail
    mockFetch.mockReset()
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    })

    const request1 = new Request(
      'https://bilgearena.com/api/og/result/X',
    ) as unknown as Parameters<typeof GET>[0]

    await expect(
      GET(request1, { params: Promise.resolve({ code: 'X' }) }),
    ).rejects.toThrow(/Inter-Bold\.woff fetch failed: 500/)

    // 2. cagri: cache reset edildi, fresh fetch — 200 OK
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    })

    const request2 = new Request(
      'https://bilgearena.com/api/og/result/X',
    ) as unknown as Parameters<typeof GET>[0]

    const res2 = (await GET(request2, {
      params: Promise.resolve({ code: 'X' }),
    })) as unknown as { _jsxRendered: boolean }

    // Cache reset oldu: 2. cagri basarili (eski promise stale donmedi)
    expect(res2._jsxRendered).toBe(true)

    // 2 fetch çağrısı yapıldı (1. fail, 2. success)
    const fontCalls = mockFetch.mock.calls.filter((c) =>
      String(c[0]).includes('Inter-Bold.woff'),
    )
    expect(fontCalls.length).toBe(2)
  })
})
