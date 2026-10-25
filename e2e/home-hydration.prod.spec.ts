import { test, expect, type Page } from '@playwright/test'

// Üretim build'i (next build + next start) gerektirir:
//   npm run build && npm run test:e2e:prod
// Dev sunucusu hydration uyumsuzluğunu farklı raporlar; bu kapı yalnız
// kullanıcının gördüğü minified üretim paketini ölçer (React #418, bulgu §3.1).

// Vercel preview'larına platformun eklediği yorum araç çubuğu (vercel.live)
// CSP'ye takılır. Üretim alan adında yoktur, uygulama kodu değildir.
const VERCEL_PREVIEW_TOOLBAR_CSP = /^Loading the script 'https:\/\/vercel\.live\/_next-live\/feedback\//

function collectPageErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() !== 'error' || VERCEL_PREVIEW_TOOLBAR_CSP.test(message.text())) return
    errors.push(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  return errors
}

test.describe('home page production hydration', () => {
  test('hydrates without console errors and keeps the server navbar', async ({ page, request }) => {
    const errors = collectPageErrors(page)

    const ssrHtml = await (await request.get('/')).text()
    await page.goto('/', { waitUntil: 'load' })
    // Hydration hatası istemci yeniden çizimiyle düzeltilir; olay bitene kadar bekle.
    await page.waitForLoadState('networkidle')

    const fingerprints = await page.evaluate((html) => {
      const fingerprint = (root: ParentNode) => {
        const nav = root.querySelector('nav[data-app-navbar]')
        if (!nav) return null
        return {
          // Erişilebilir ada değil veri özniteliğine bağlı: logo adı aria-label'dan
          // sr-only metne taşındığında (#687) bu kapı yanlışlıkla kırılmasın.
          academyLogo: Boolean(nav.querySelector('a[data-academy-logo] img[src*="brand-crest-orbit"]')),
          legacyLogo: Boolean(nav.querySelector('img[src*="/logo/icon-dark.svg"]')),
          themeClass: nav.querySelector('[data-navbar-theme]')?.getAttribute('class') ?? null,
          currentHref: nav.querySelector('a[aria-current="page"]')?.getAttribute('href') ?? null,
        }
      }
      const server = new DOMParser().parseFromString(html, 'text/html')
      return { server: fingerprint(server), client: fingerprint(document) }
    }, ssrHtml)

    expect(errors).toEqual([])
    expect(fingerprints.server).toEqual({
      academyLogo: true,
      legacyLogo: false,
      themeClass: 'hidden',
      currentHref: '/',
    })
    expect(fingerprints.client).toEqual(fingerprints.server)
  })
})
