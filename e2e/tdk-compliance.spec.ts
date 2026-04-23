import { test, expect } from '@playwright/test'

// Canli sayfalarda TDK uyum — ASCII yasakli kelime taramasi.
// Kaynak fixture: src/lib/validations/tdk-rules.fixture.ts
// Bu liste manuel ozet: yuksek-sinyalli, proje-ozel kelimeler.
// Yeni kelime eklemek icin once fixture'a ekle, sonra buraya.

const FORBIDDEN_UI_TOKENS = [
  'Hazirlik',
  'Kayit',
  'Turkce',
  'Ingilizce',
  'Gorev',
  'Gunluk',
  'Ozet',
  'Icin',
  'Bolum',
  'Ogrenci',
  'Cozum',
  'Cozme',
  'Soru Cozme',
  'Ilk Adim',
  'Savasci',
  'Oyunlastirilmis',
  'Durust',
  'Haftalik',
  'Yangin',
] as const

function findForbidden(text: string): string[] {
  const found: string[] = []
  for (const token of FORBIDDEN_UI_TOKENS) {
    const pattern = new RegExp(`\\b${token}\\b`)
    if (pattern.test(text)) found.push(token)
  }
  return found
}

test.describe('TDK uyum — canli sayfa ASCII taramasi', () => {
  test('landing sayfa ASCII yasakli kelime icermez', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    const bodyText = await page.locator('body').innerText()
    const violations = findForbidden(bodyText)
    expect(
      violations,
      `Landing ihlaller: ${violations.join(', ') || '(yok)'}`,
    ).toEqual([])
  })

  test('arena sayfa ASCII yasakli kelime icermez', async ({ page }) => {
    await page.goto('/arena')
    await page.waitForLoadState('networkidle')
    const bodyText = await page.locator('body').innerText()
    const violations = findForbidden(bodyText)
    expect(
      violations,
      `Arena ihlaller: ${violations.join(', ') || '(yok)'}`,
    ).toEqual([])
  })

  test('nasil-calisir sayfa JSON-LD + gorunur metin ASCII temiz', async ({ page }) => {
    await page.goto('/nasil-calisir')
    await page.waitForLoadState('networkidle')

    const bodyText = await page.locator('body').innerText()
    const bodyViolations = findForbidden(bodyText)
    expect(
      bodyViolations,
      `Body ihlaller: ${bodyViolations.join(', ') || '(yok)'}`,
    ).toEqual([])

    // JSON-LD: Google structured data — SEO icin Turkce olmali
    const jsonLdScripts = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents()
    const combinedJsonLd = jsonLdScripts.join(' ')
    const jsonLdViolations = findForbidden(combinedJsonLd)
    expect(
      jsonLdViolations,
      `JSON-LD ihlaller: ${jsonLdViolations.join(', ') || '(yok)'}`,
    ).toEqual([])
  })

  test('giris sayfa form etiketleri ASCII yasakli yok', async ({ page }) => {
    await page.goto('/giris')
    await page.waitForLoadState('networkidle')
    const bodyText = await page.locator('body').innerText()
    const violations = findForbidden(bodyText)
    expect(
      violations,
      `Giris ihlaller: ${violations.join(', ') || '(yok)'}`,
    ).toEqual([])
  })
})
