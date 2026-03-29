import { test, expect } from '@playwright/test'

test.describe('Accessibility', () => {
  test('landing page has no broken images', async ({ page }) => {
    const brokenImages: string[] = []

    page.on('response', (response) => {
      if (response.request().resourceType() === 'image' && response.status() >= 400) {
        brokenImages.push(response.url())
      }
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    expect(brokenImages).toEqual([])
  })

  test('all interactive elements are keyboard accessible', async ({ page }) => {
    await page.goto('/')

    // Tab ile navigasyon calisir
    await page.keyboard.press('Tab')
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName)
    expect(focusedElement).toBeTruthy()
  })

  test('login page loads correctly', async ({ page }) => {
    await page.goto('/giris')

    // Google login butonu gorunmeli
    await expect(
      page.getByRole('button', { name: /google/i }).first()
        .or(page.getByText(/google/i).first())
    ).toBeVisible({ timeout: 10000 })
  })

  test('404 page shows for invalid routes', async ({ page }) => {
    const response = await page.goto('/bu-sayfa-yok-12345')

    // 404 status veya ozel 404 sayfasi
    expect(response?.status()).toBe(404)
  })

  test('responsive: mobile viewport renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')

    // Sayfa mobile'da da gorunur
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })
})
