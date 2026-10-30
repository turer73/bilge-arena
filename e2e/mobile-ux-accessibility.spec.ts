import { test, expect, type Locator, type Page } from '@playwright/test'

const passage = 'Okul kütüphanesindeki kitaplar sınıflara paylaştırılırken her sınıfın öğrenci sayısı ve daha önce aldığı kitaplar dikkate alınmıştır. Öğrenciler tabloyu inceleyerek yeni dağıtımın nasıl yapılacağını tartışmaktadır. Bir öğrencinin önerisinin yalnız kendi sınıfına değil, diğer sınıfların ihtiyacına da uygun olması beklenmektedir.'
const question = {
  id: '22222222-2222-4222-8222-222222222222',
  game: 'matematik', category: 'sayilar', difficulty: 1, base_points: 10,
  content: {
    passage,
    question: 'Bu dağıtımda bütün sınıfların ihtiyacını birlikte değerlendiren yaklaşım hangisidir?',
    options: [
      'Öğrenci sayısı ile daha önce verilen kitap sayısını birlikte değerlendirmek.',
      'Yalnız en kalabalık sınıfa bütün yeni kitapları vermek.',
      'Daha önce kitap alan sınıflara yeniden hiç kitap vermemek.',
      'Sınıfların ihtiyacına bakmadan ilk başvuran sınıfı seçmek.',
      'Her sınıfın öğrenci sayısını dikkate almadan eşit sayıda kitap vermek.',
    ],
  },
}

async function expectVisibleFocus(page: Page, target: Locator) {
  await expect(target).toBeFocused()
  let stable = 0
  await expect.poll(async () => {
    const visible = await target.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const boundary = el.closest('dialog, [data-quiz-feedback]')?.getBoundingClientRect()
      const top = Math.max(0, boundary?.top ?? 0)
      const bottom = Math.min(innerHeight, boundary?.bottom ?? innerHeight)
      return document.activeElement === el && r.top >= top - 1 && r.bottom <= bottom + 1 && r.left >= 0 && r.right <= innerWidth
    })
    stable = visible ? stable + 1 : 0
    return stable >= 4
  }, { intervals: [50, 100, 100, 100] }).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

async function crossNativeDialogEdge(page: Page, key: 'Tab' | 'Shift+Tab') {
  // Chromium can visit browser chrome (BODY) or the scrollable DIALOG itself
  // at a modal edge. Stop immediately on a control; background controls fail
  // the expected modal-control assertion below rather than being skipped.
  for (let step = 0; step < 4; step++) {
    await page.keyboard.press(key)
    const transientStop = await page.evaluate(() => document.activeElement === document.body
      || document.activeElement?.matches('dialog[open]'))
    if (!transientStop) return
  }
}

const scenarios = [
  { name: '320px reflow', width: 320, height: 640, enlargedText: false },
  // Layout equivalent of a 640x900 viewport at 200% full-page zoom.
  // This does not claim a native browser zoom-menu or physical-device test.
  { name: '200% equivalent short viewport', width: 320, height: 450, enlargedText: false },
  { name: '200% browser default text', width: 360, height: 640, enlargedText: true },
  { name: '640px large browser text', width: 640, height: 900, enlargedText: true },
]

for (const scenario of scenarios) {
  test(`${scenario.name}: long content, feedback tools and modal focus stay accessible`, async ({ page, browserName }, testInfo) => {
    test.skip(scenario.enlargedText && browserName !== 'chromium', 'Browser default font preference uses Chromium CDP; other engines need their native text settings.')
    await page.setViewportSize({ width: scenario.width, height: scenario.height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.route('**/api/questions/preview?*', (route) => route.fulfill({ json: { question } }))
    await page.route('**/api/questions/grade', (route) => {
      const selectedOption = route.request().postDataJSON().selectedOption
      // Deliberately wrong server fixture exercises the longer result message.
      return route.fulfill({ json: {
        isCorrect: false, correctOption: (selectedOption + 1) % question.content.options.length,
        acceptedOption: selectedOption,
        solution: 'Sınıfların ihtiyaçları birlikte değerlendirilmelidir. Öğrenci sayısı tek başına yeterli değildir; daha önce verilen kitaplar da hesaba katılır. Bu açıklama yalnız arayüz testi için hazırlanmıştır.',
      } })
    })
    await page.goto('/arena/matematik?exam_ref=TYT&category=sayilar')
    if (scenario.enlargedText) {
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Page.setFontSizes', { fontSizes: { standard: 32 } })
      await expect(page.locator('html')).toHaveCSS('font-size', '32px')
    }
    await page.getByRole('button', { name: 'Tümünü Reddet', exact: true }).click()
    const reading = page.getByRole('button', { name: 'Yazı boyutu ayarları', exact: true })
    await reading.press('Enter')
    const readingDialog = page.getByRole('dialog', { name: 'Okuma ayarları', exact: true })
    await expect(readingDialog.getByRole('button', { name: 'Pencereyi kapat', exact: true })).toBeFocused()
    await page.getByRole('radio', { name: 'Büyük %112', exact: true }).check()
    await page.getByRole('radio', { name: 'Büyük %112', exact: true }).press('Tab')
    await expectVisibleFocus(page, readingDialog.getByRole('button', { name: 'Hazırlığa dön', exact: true }))
    await crossNativeDialogEdge(page, 'Tab')
    await expectVisibleFocus(page, readingDialog.getByRole('button', { name: 'Pencereyi kapat', exact: true }))
    await page.keyboard.press('Escape')
    await expect(readingDialog).toBeHidden()
    await expectVisibleFocus(page, reading)
    await page.getByRole('button', { name: 'Pratik: Zamansız', exact: true }).press('Space')
    await page.getByRole('button', { name: 'Önizlemeyi başlat · 1 soru', exact: true }).press('Enter')
    await expect(page.locator('[data-quiz-passage]')).toHaveText(passage)
    if (scenario.enlargedText) {
      expect(await page.locator('[data-quiz-prompt]').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(35)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.locator('[data-quiz-option]').first().click()
    const feedback = page.locator('[data-quiz-feedback]')
    const next = feedback.getByRole('button', { name: 'Sonucu Gör', exact: true })
    await expectVisibleFocus(page, next)
    const tools = feedback.locator('[data-quiz-feedback-tools] button')
    await expect(tools).toHaveCount(4)
    const bounds = await tools.evaluateAll(elements => elements.map(el => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height,
        clipped: el.scrollWidth > el.clientWidth + 1 }
    }))
    for (let i = 0; i < bounds.length; i++) {
      expect(bounds[i].width).toBeGreaterThanOrEqual(44)
      expect(bounds[i].height).toBeGreaterThanOrEqual(44)
      expect(bounds[i].clipped).toBe(false)
      for (let j = i + 1; j < bounds.length; j++) {
        const overlapX = Math.min(bounds[i].right, bounds[j].right) - Math.max(bounds[i].left, bounds[j].left)
        const overlapY = Math.min(bounds[i].bottom, bounds[j].bottom) - Math.max(bounds[i].top, bounds[j].top)
        expect(overlapX > 1 && overlapY > 1).toBe(false)
      }
    }
    await page.screenshot({ path: testInfo.outputPath('feedback-controls.png') })
    await expectVisibleFocus(page, next)
    await page.keyboard.press('Tab')
    const details = feedback.getByRole('button', { name: 'Ayrıntılı Çözüm', exact: true })
    await expectVisibleFocus(page, details)
    await page.keyboard.press('Enter')
    const solutionDialog = page.getByRole('dialog', { name: 'Ayrıntılı çözüm', exact: true })
    await expectVisibleFocus(page, solutionDialog.getByRole('button', { name: 'Pencereyi kapat', exact: true }))
    await crossNativeDialogEdge(page, 'Shift+Tab')
    await expectVisibleFocus(page, solutionDialog.getByRole('button', { name: 'Sonucu Gör', exact: true }))
    await page.keyboard.press('Escape')
    await expect(solutionDialog).toBeHidden()
    await expectVisibleFocus(page, details)
    for (const name of ['Konu Anlatımı', 'Begen', 'Yorumlar']) {
      await page.keyboard.press('Tab')
      await expectVisibleFocus(page, feedback.getByRole('button', { name, exact: true }))
    }
    await page.screenshot({ path: testInfo.outputPath('feedback-focus.png') })
    await expectVisibleFocus(page, feedback.getByRole('button', { name: 'Yorumlar', exact: true }))
    await testInfo.attach('final-layout', { body: JSON.stringify(await page.evaluate(() => {
      const rect = (selector: string) => {
        const el = document.querySelector(selector)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { top: r.top, bottom: r.bottom, height: r.height }
      }
      return { height: innerHeight, scrollY, viewport: { height: visualViewport?.height, top: visualViewport?.offsetTop },
        header: rect('[data-responsive-quiz-shell] header'), panel: rect('[data-quiz-feedback]'),
        focused: document.activeElement?.getBoundingClientRect().toJSON() }
    })), contentType: 'application/json' })
  })
}
