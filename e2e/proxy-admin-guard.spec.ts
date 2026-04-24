import { test, expect } from '@playwright/test'

// PR-B (middleware.ts -> proxy.ts) icin auth boundary smoke testleri.
// Rename sonrasi sessiz regresyon yakalamak icin minimum set.
// Authenticated testler ayri PR'da (e2e-auth-setup infra gerekir).

test.describe('proxy auth boundary', () => {

  test('unauthenticated user on /admin redirects to /giris', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/giris/)
  })

  // Proxy'nin /api/health/ping bypass mantigini kilitler (proxy.ts:9-11).
  // Uptime Kuma bagimliligi — auth cookie olmadan da 200 dondurmeli.
  test('health endpoint bypasses proxy auth (no cookie)', async ({ request }) => {
    const res = await request.get('/api/health/ping')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(typeof body.ts).toBe('number')
  })

  // /admin redirect response'unda no-store cache headers dogrulamasi.
  // next.config.mjs headers() /admin/:path* match'i redirect'e de uygulaniyor,
  // proxy.ts:81-83 redundant header set'i authenticated yola ek guvence.
  // Regresyon: redirect'te cache header dusarsa CF edge admin redirect'i cachelebilir.
  test('admin redirect carries no-store cache headers', async ({ request }) => {
    const res = await request.get('/admin', { maxRedirects: 0, failOnStatusCode: false })
    expect(res.status()).toBeGreaterThanOrEqual(300)
    expect(res.status()).toBeLessThan(400)
    expect(res.headers()['cache-control']).toContain('no-store')
    expect(res.headers()['cdn-cache-control']).toBe('no-store')
    expect(res.headers()['cloudflare-cdn-cache-control']).toBe('no-store')
  })
})
