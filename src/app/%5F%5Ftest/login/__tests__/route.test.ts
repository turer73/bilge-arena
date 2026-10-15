import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from '../route'

function enableIsolatedPreview(): void {
  vi.stubEnv('BILGE_ISOLATED_TEST', 'true')
  vi.stubEnv('BILGE_ACADEMY_PREVIEW_BRIDGE', 'true')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:3141')
}

describe('isolated test login release boundary', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it.each([
    ['GET', (request: NextRequest) => GET(request)],
    ['POST', (request: NextRequest) => POST(request)],
  ])('returns 404 for %s in production even when test flags are present', async (method, handler) => {
    vi.stubEnv('NODE_ENV', 'production')
    enableIsolatedPreview()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('upstream must stay closed'))
    const request = new NextRequest('http://localhost:3141/__test/login', {
      method,
    })

    const response = await handler(request)

    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-robots-tag')).toContain('noindex')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns 404 for a non-local host in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    enableIsolatedPreview()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('upstream must stay closed'))

    const response = await GET(new NextRequest('https://bilgearena.com/__test/login'))

    expect(response.status).toBe(404)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
