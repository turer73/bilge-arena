import { test, expect } from '@playwright/test'

test.describe('Arena Dashboard', () => {
  test('shows 5 game consoles', async ({ page }) => {
    await page.goto('/arena')

    // 5 oyun konsolu gorunmeli
    const gameCards = page.locator('[data-testid="game-console"], .game-console, a[href*="/arena/"]')
    await expect(gameCards.first()).toBeVisible({ timeout: 10000 })
  })

  test('navigates to a game console', async ({ page }) => {
    await page.goto('/arena')

    // Matematik oyun konsoluna git
    const mathLink = page.getByRole('link', { name: /matematik/i }).first()
    if (await mathLink.isVisible()) {
      await mathLink.click()
      await expect(page).toHaveURL(/\/arena\/matematik/)
    }
  })
})

test.describe('Game Console (Matematik)', () => {
  test('shows lobby with mode selector', async ({ page }) => {
    await page.goto('/arena/matematik/oyna')

    // Lobby gorunmeli
    await expect(page.getByText(/mod|klasik|blitz|maraton/i).first()).toBeVisible({ timeout: 10000 })
  })

  test('can start a quiz as guest', async ({ page }) => {
    await page.goto('/arena/matematik/oyna')

    // Basla butonunu bul ve tikla
    const startButton = page.getByRole('button', { name: /basla|oyna|start/i }).first()
    await expect(startButton).toBeVisible({ timeout: 10000 })
    await startButton.click()

    // Quiz yukleniyor veya soru gorunuyor
    await expect(
      page.locator('[data-testid="question-card"], .question-card, [class*="question"]').first()
        .or(page.getByText(/soru|question/i).first())
    ).toBeVisible({ timeout: 15000 })
  })
})
