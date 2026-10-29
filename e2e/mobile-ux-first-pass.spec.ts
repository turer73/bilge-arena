import { test, expect } from '@playwright/test'

const question = {
  id: '11111111-1111-4111-8111-111111111111',
  game: 'matematik', category: 'sayilar', difficulty: 1, base_points: 10,
  content: {
    question: 'Bir sınıfta 12 kız ve 10 erkek öğrenci vardır. Sınıfta toplam kaç öğrenci vardır?',
    options: ['20', '21', '22', '23', '24'],
  },
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 })
  await page.route('**/api/questions/preview?*', (route) => route.fulfill({ json: { question } }))
  await page.goto('/arena/matematik?exam_ref=TYT&category=sayilar')
  await page.getByRole('button', { name: 'Tümünü Reddet', exact: true }).click()
  await expect(page.locator('[data-cookie-banner]')).toBeHidden()
})

test('mobile start is above the tab bar and reading settings carry into the game', async ({ page }) => {
  const start = page.getByRole('button', { name: 'Önizlemeyi başlat · 1 soru', exact: true })
  const startBox = await start.boundingBox()
  const navBox = await page.locator('[data-bottom-nav]').boundingBox()
  expect(startBox).not.toBeNull()
  expect(navBox).not.toBeNull()
  expect(startBox!.y).toBeGreaterThanOrEqual(0)
  expect(startBox!.y + startBox!.height).toBeLessThan(navBox!.y)
  await page.getByRole('button', { name: 'Yazı boyutu ayarları', exact: true }).click()
  await page.getByRole('radio', { name: 'Büyük %112', exact: true }).check()
  await page.getByRole('button', { name: 'Hazırlığa dön', exact: true }).click()
  await start.click()
  await expect(page.locator('[data-quiz-font-size]')).toHaveAttribute('data-quiz-font-size', 'large')
  await page.getByRole('button', { name: 'Yazı boyutu ve ses ayarları', exact: true }).click()
  await expect(page.getByText('Bu pencere açıkken soru süresi duraklatılır.')).toBeVisible()
  const timerBefore = await page.locator('[data-quiz-timer]').textContent()
  await page.clock.install()
  await page.clock.fastForward(3000)
  await expect(page.locator('[data-quiz-timer]')).toHaveText(timerBefore!)
  await page.getByRole('button', { name: 'Oyuna dön', exact: true }).click()
  await page.clock.fastForward(2000)
  await expect(page.locator('[data-quiz-timer]')).not.toHaveText(timerBefore!)
})

test('pending answers are visible and a failed request retries the same choice', async ({ page }) => {
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  const selections: number[] = []
  await page.route('**/api/questions/grade', async (route) => {
    selections.push(route.request().postDataJSON().selectedOption)
    if (selections.length === 1) {
      await held
      await route.fulfill({ status: 503, json: { error: 'local-test' } })
    } else {
      await route.fulfill({ json: { isCorrect: true, correctOption: 2, solution: '12 + 10 = 22.', acceptedOption: 2 } })
    }
  })
  await page.getByRole('button', { name: 'Önizlemeyi başlat · 1 soru', exact: true }).click()
  await page.getByRole('button', { name: /seçeneği: 22$/ }).click()
  await expect(page.getByRole('status')).toHaveText('Cevabın doğrulanıyor…')
  await expect(page.locator('[data-quiz-option="selected"]')).toHaveText(/22/)
  const options = page.locator('[data-quiz-option]')
  for (const option of await options.all()) await expect(option).toBeDisabled()
  release()
  await expect(page.getByRole('alert').filter({ hasText: 'Seçimin korunuyor' })).toBeVisible()
  await page.getByRole('button', { name: 'Aynı cevabı tekrar gönder', exact: true }).click()
  await expect(page.locator('[data-quiz-option="correct"]')).toHaveText(/22/)
  expect(selections).toEqual([2, 2])
})

test('successful retry keeps the first selected answer between the header and result panel', async ({ page }) => {
  const selections: number[] = []
  await page.route('**/api/questions/grade', async (route) => {
    const selectedOption = route.request().postDataJSON().selectedOption
    selections.push(selectedOption)
    if (selections.length === 1) {
      await route.fulfill({ status: 503, json: { error: 'local-test' } })
    } else {
      // The server fixture accepts the displayed first choice, regardless of shuffle.
      await route.fulfill({ json: {
        isCorrect: true, correctOption: selectedOption,
        acceptedOption: selectedOption, solution: 'Test notlandırma yanıtı.',
      } })
    }
  })
  await page.getByRole('button', { name: 'Yazı boyutu ayarları', exact: true }).click()
  await page.getByRole('radio', { name: 'Büyük %112', exact: true }).check()
  await page.getByRole('button', { name: 'Hazırlığa dön', exact: true }).click()
  await page.getByRole('button', { name: 'Önizlemeyi başlat · 1 soru', exact: true }).click()
  const firstOption = page.locator('[data-quiz-option]').first()
  await firstOption.click()
  await expect(page.getByRole('alert').filter({ hasText: 'Seçimin korunuyor' })).toBeVisible()
  await expect(page.getByText('Cevap doğrulanamadı', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Aynı cevabı tekrar gönder', exact: true }).click()
  await expect(firstOption).toHaveAttribute('data-quiz-option', 'correct')
  await expect(page.locator('[data-quiz-feedback]')).toBeVisible()
  await expect.poll(async () => {
    const selected = await firstOption.boundingBox()
    const header = await page.locator('[data-responsive-quiz-shell] header').boundingBox()
    const feedback = await page.locator('[data-quiz-feedback]').boundingBox()
    return selected !== null && header !== null && feedback !== null
      && selected.y >= header.y + header.height
      && selected.y + selected.height <= feedback.y
  }).toBe(true)
  expect(selections).toHaveLength(2)
  expect(selections[1]).toBe(selections[0])
})
