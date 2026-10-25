import { test, expect } from '@playwright/test'

test.describe('Landing Page', () => {
  test('renders hero section and navigation', async ({ page }) => {
    await page.goto('/')

    // Logo veya site adi gorunur
    await expect(page.locator('[data-app-navbar]')).toBeVisible()

    // Hero basligi gorunur
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // CTA butonu var
    const ctaButton = page.getByRole('link', { name: /oyunları keşfet|oyna/i }).first()
    await expect(ctaButton).toBeVisible()
  })

  test('navigates to arena from CTA', async ({ page }) => {
    await page.goto('/')

    const ctaButton = page.getByRole('link', { name: /oyunları keşfet|oyna/i }).first()
    await ctaButton.click()

    await expect(page).toHaveURL(/\/arena/, { timeout: 15_000 })
  })

  test('navigates to login page', async ({ page }) => {
    await page.goto('/')

    const loginLink = page.getByRole('link', { name: /giriş yap/i }).first()
    await loginLink.click()

    await expect(page).toHaveURL(/\/giris/, { timeout: 15_000 })
  })

  test('has correct meta tags for SEO', async ({ page }) => {
    await page.goto('/')

    const title = await page.title()
    expect(title).toContain('Bilge Arena')

    const description = await page.getAttribute('meta[name="description"]', 'content')
    expect(description).toBeTruthy()
    expect(description!.length).toBeGreaterThan(50)

    // OG tags
    const ogTitle = await page.getAttribute('meta[property="og:title"]', 'content')
    expect(ogTitle).toContain('Bilge Arena')
  })

  test('theme toggle works', async ({ page }) => {
    await page.goto('/')

    const html = page.locator('html')
    const initialTheme = await html.getAttribute('data-theme')

    // Tema degistir butonunu bul ve tikla
    const themeButton = page.getByRole('button', { name: /tema|theme|karanlik|aydinlik/i }).first()
    if (await themeButton.isVisible()) {
      await themeButton.click()
      const newTheme = await html.getAttribute('data-theme')
      expect(newTheme).not.toBe(initialTheme)
    }
  })

  test('aligns home sections, prevents horizontal overflow and keeps desktop navbar single-row across 8 viewports (#679)', async ({ page }) => {
    await page.goto('/')

    const viewports = [375, 390, 768, 1024, 1280, 1366, 1440, 1920]
    for (const width of viewports) {
      await page.setViewportSize({ width, height: 900 })

      const metrics = await page.evaluate(() => {
        const doc = document.documentElement
        const hero = document.querySelector('[aria-labelledby="home-title"]')
        const together = document.querySelector('[aria-labelledby="together-title"]')
        const featured = document.querySelector('[aria-labelledby="featured-learning-title"]')
        const partnership = document.querySelector('[aria-labelledby="institution-partnership-title"]')
        const faq = document.querySelector('[aria-labelledby="home-faq-title"]')
        const rects = [hero, together, featured, partnership, faq].map((el) => el?.getBoundingClientRect())
        return {
          clientWidth: doc.clientWidth,
          scrollWidth: doc.scrollWidth,
          rects: rects.map((r) => (r ? { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) } : null)),
        }
      })

      expect(metrics.scrollWidth, `overflow at ${width}px`).toBeLessThanOrEqual(metrics.clientWidth)
      const [heroRect, togetherRect, featuredRect, partnershipRect, faqRect] = metrics.rects
      expect(heroRect).not.toBeNull()
      for (const rect of [togetherRect, featuredRect, partnershipRect, faqRect]) {
        expect(rect).not.toBeNull()
        expect(Math.abs(rect!.left - heroRect!.left), `left alignment at ${width}px`).toBeLessThanOrEqual(1)
        expect(Math.abs(rect!.right - heroRect!.right), `right alignment at ${width}px`).toBeLessThanOrEqual(1)
      }

      if (width >= 1280) {
        const navRow = await page.evaluate(() => {
          const nav = document.querySelector('[data-app-navbar]')
          const links = Array.from(nav?.querySelectorAll('a, button[aria-controls="more-navigation"]') ?? [])
            .filter((el) => (el as HTMLElement).offsetParent !== null && ['Ana Sayfa', 'Oyunlar', 'Ders Çalış', 'Oda Modu', 'Sıralama', 'Diğer'].includes(el.textContent?.trim() ?? ''))
          const tops = links.map((el) => Math.round(el.getBoundingClientRect().top))
          const heights = links.map((el) => Math.round(el.getBoundingClientRect().height))
          return { count: links.length, maxTopDiff: Math.max(...tops) - Math.min(...tops), maxHeight: Math.max(...heights) }
        })
        expect(navRow.count, `desktop nav items at ${width}px`).toBe(6)
        expect(navRow.maxTopDiff, `single row top alignment at ${width}px`).toBeLessThanOrEqual(2)
        expect(navRow.maxHeight, `single line item height at ${width}px`).toBeLessThanOrEqual(44)
      }
    }
  })

  test('duello keeps mobile bottom-nav only below 768px and Academy navbar at 768px+ (#679)', async ({ page }) => {
    await page.goto('/arena/duello')

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.locator('[data-app-navbar]')).toBeHidden()
    await expect(page.locator('[data-bottom-nav]')).toBeVisible()

    for (const width of [768, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await expect(page.locator('[data-app-navbar]')).toBeVisible()
      await expect(page.locator('[data-bottom-nav]')).toBeHidden()
      await expect(page.locator('[data-app-navbar] img[src*="brand-crest-orbit.png"]')).toBeVisible()
    }
  })
})
