import { test, expect } from '@playwright/test'

test.describe('Landing Page', () => {
  test('renders hero section and navigation', async ({ page }) => {
    await page.goto('/')

    // Logo veya site adi gorunur
    await expect(page.locator('nav')).toBeVisible()

    // Hero basligi gorunur
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    // CTA butonu var
    const ctaButton = page.getByRole('link', { name: /arena|basla|oyna/i })
    await expect(ctaButton).toBeVisible()
  })

  test('navigates to arena from CTA', async ({ page }) => {
    await page.goto('/')

    const ctaButton = page.getByRole('link', { name: /arena|basla|oyna/i }).first()
    await ctaButton.click()

    await expect(page).toHaveURL(/\/arena/)
  })

  test('navigates to login page', async ({ page }) => {
    await page.goto('/')

    const loginLink = page.getByRole('link', { name: /giri|login/i }).first()
    await loginLink.click()

    await expect(page).toHaveURL(/\/giris/)
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
})
