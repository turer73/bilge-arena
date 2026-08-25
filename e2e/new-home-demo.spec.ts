import { expect, test, type Page } from '@playwright/test'

async function dismissCookieBanner(page: Page) {
  const rejectButton = page.getByRole('button', { name: 'Tümünü Reddet' })
  if (await rejectButton.isVisible().catch(() => false)) await rejectButton.click()
}

test.describe('Yeni ana sayfa demosu', () => {
  test('demo sınırını, metadata ve responsive düzeni korur', async ({ page }) => {
    await page.goto('/demo/yeni-ana-sayfa')
    await dismissCookieBanner(page)

    await expect(page.getByRole('heading', { level: 1, name: /bir sonraki adımın hazır/i })).toBeVisible()
    await expect(page.getByText(/örnek rota · kişisel veri değil/i)).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex.*nofollow/i)

    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
      await page.setViewportSize(viewport)
      await expect.poll(() => page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }))).toEqual({ clientWidth: viewport.width, scrollWidth: viewport.width })
    }

    await page.getByRole('button', { name: 'Tema seç' }).click()
    await page.getByRole('menuitemradio', { name: 'Gün Işığı' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(1280)
  })

  test('skip bağlantısı, rol klavyesi ve FAQ ilişkisi çalışır', async ({ page }) => {
    await page.goto('/demo/yeni-ana-sayfa')
    await dismissCookieBanner(page)

    await page.locator('body').press('Home')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Ana içeriğe geç' })).toBeFocused()

    const studentTab = page.getByRole('tab', { name: 'Öğrenci' })
    await studentTab.focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'Öğretmen / koç' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('heading', { name: 'Takip, yönlendirmeye dönüşür.' })).toBeVisible()

    const faqButton = page.getByRole('button', { name: /gerçek bir kurum verisi mi/i })
    await expect(faqButton).toHaveAttribute('aria-controls', 'faq-answer-0')
    await expect(page.locator('#faq-answer-0')).toHaveAttribute('aria-labelledby', 'faq-question-0')
  })

  test('kurumsal CTA doğru iletişim kapsamına iner', async ({ page }) => {
    await page.goto('/demo/yeni-ana-sayfa')
    await dismissCookieBanner(page)
    await page.getByRole('link', { name: /pilot kapsamını ilet/i }).click()

    await expect(page).toHaveURL(/\/iletisim#kurumsal-pilot$/)
    await expect(page.locator('#kurumsal-pilot')).toContainText(/erişim otomatik açılmaz/i)
    await expect(page.getByText(/bireysel öğrenci başlangıcı ücretsizdir/i)).toBeVisible()
  })
})
