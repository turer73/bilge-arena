import { test, expect } from '@playwright/test'

// Turkce karakter render testleri — UI, font, OG, manifest, HTML lang.
// Ilgili PR: TDK uyum zinciri PR1-PR5.
// Plan kaynak: C:/Users/sevdi/.claude/plans/merhaba-bilge-arena-i-in-rustling-gray.md

const TURKISH_CHAR_REGEX = /[İıŞşÇçĞğÖöÜü]/

test.describe('Turkce karakter render', () => {
  test('landing hero h1 en az bir Turkce karakter icerir', async ({ page }) => {
    await page.goto('/')
    const h1 = page.getByRole('heading', { level: 1 }).first()
    await expect(h1).toBeVisible()
    const text = await h1.innerText()
    expect(text, `h1 icerigi: "${text}"`).toMatch(TURKISH_CHAR_REGEX)
  })

  test('landing h1 Cinzel font ailesi ile render edilir', async ({ page }) => {
    await page.goto('/')
    const h1 = page.getByRole('heading', { level: 1 }).first()
    const fontFamily = await h1.evaluate(
      (el) => window.getComputedStyle(el).fontFamily,
    )
    expect(fontFamily.toLowerCase()).toContain('cinzel')
  })

  test('navbar linklerinde ASCII yasakli kelime yok', async ({ page }) => {
    await page.goto('/')
    const nav = page.locator('nav').first()
    await expect(nav).toBeVisible()
    const text = await nav.innerText()
    expect(text).not.toMatch(/\b(Turkce|Hazirlik|Kayit|Bolum|Gorev|Ogrenci)\b/)
  })

  test('OG route Turkce parametrelerle 200 + image/png donduruyor', async ({ page }) => {
    const url =
      '/og?title=' +
      encodeURIComponent('İstanbul Hazırlık') +
      '&subtitle=' +
      encodeURIComponent('Şevval Yıldız Ayşegül')
    const response = await page.request.get(url)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('image/png')
    const body = await response.body()
    expect(body.length).toBeGreaterThan(10_000)
    expect(body.subarray(0, 4).toString('hex')).toBe('89504e47')
  })

  test('manifest.json icerik Turkce karakter + ASCII yasakli yok', async ({ page }) => {
    const response = await page.request.get('/manifest.json')
    expect(response.status()).toBe(200)
    const data = await response.json()
    const combined = [data.name, data.short_name, data.description]
      .filter(Boolean)
      .join(' ')
    expect(combined).not.toMatch(/\b(Hazirlik|Turkce|Oyunlastirilmis)\b/)
    expect(combined).toMatch(TURKISH_CHAR_REGEX)
  })

  test('HTML lang tr ve body Turkce karakter yogunlugu yeterli', async ({ page }) => {
    await page.goto('/')
    const lang = await page.locator('html').getAttribute('lang')
    expect(lang).toBe('tr')
    const bodyText = await page.locator('body').innerText()
    const turkishCharCount = (bodyText.match(/[İıŞşÇçĞğÖöÜü]/g) ?? []).length
    expect(turkishCharCount).toBeGreaterThan(5)
  })
})
