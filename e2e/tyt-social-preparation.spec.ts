import { expect, test } from '@playwright/test'

// Browser contract test with synthetic auth/API responses. No live content,
// user account, source acceptance or publication is created by this test.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
for (const alternate of [false, true]) test(`preparation 20-question browser flow (${alternate ? '21–25' : '16–20'})`, async ({ page, context }) => {
  test.setTimeout(90000)
  const user = { id: id(800), aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.test',
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' }
  const exp = Math.floor(Date.now() / 1000) + 3600
  const jwt = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
    Buffer.from(JSON.stringify({ sub: user.id, exp, aud: 'authenticated', role: 'authenticated' })).toString('base64url'), 'synthetic-not-a-real-signature'].join('.')
  const session = 'base64-' + Buffer.from(JSON.stringify({ access_token: jwt, refresh_token: 'synthetic-refresh', expires_at: exp, expires_in: 3600, token_type: 'bearer', user })).toString('base64url')
  await context.addCookies(['placeholder', 'lvnmzdowhfzmpkueurih'].map(ref => ({ name: `sb-${ref}-auth-token`, value: session, url: 'http://localhost:3000' })))
  await page.route('**/auth/v1/**', route => route.fulfill({ json: route.request().url().includes('/user') ? user : { access_token: jwt, user, expires_in: 3600, refresh_token: 'synthetic-refresh' } }))
  await page.route('**/api/profile**', route => route.fulfill({ json: { profile: { id: user.id, username: 'synthetic', display_name: 'Sentetik öğrenci', role: 'student', total_xp: 0, coins: 0, exam_ref: 'TYT', onboarding_completed: true } } }))
  await page.route('**/api/backgrounds', route => route.fulfill({ json: { backgrounds: [] } }))
  await page.route('**/api/consent', route => route.fulfill({ json: { success: true } }))
  const questions = Array.from({ length: 20 }, (_, i) => ({ id: id(i+1), game: 'sosyal',
    category: i < 5 ? 'tarih' : i < 10 ? 'cografya' : i < 15 || alternate ? 'felsefe' : 'din_kulturu',
    subcategory: null, topic: null, difficulty: 2, level_tag: null, base_points: 20,
    content: { question: `Sentetik soru ${i+1}`, passage: 'Soru öncülü görünür.', options: ['Bir','İki','Üç','Dört','Beş'] } }))
  const progress: { questionId: string; selectedOption: number; correctOption: number; isCorrect: boolean; solution: string }[] = []
  await page.route('**/api/study/tyt-social-preparation', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { available: true, policyVersion: 'tyt-social-2027-v1',
      examYear: 2027, variant: null, resume: null, candidateQuestionCount: 20, bookletQuestionCount: 25, officialExamCertification: false, wholeCurriculumMeasurement: false } })
    expect(route.request().postDataJSON().variant).toBe(alternate ? 'questions_21_25' : 'questions_16_20')
    return route.fulfill({ json: { attemptId: id(700), expiresAt: new Date(Date.now()+3600000).toISOString(), examYear: 2027, questions, progress } })
  })
  await page.route('**/api/questions/grade', async route => {
    const body = route.request().postDataJSON()
    expect(body.attemptId).toBe(id(700)); expect(progress.some(p => p.questionId === body.questionId)).toBe(false)
    progress.push({ questionId: body.questionId, selectedOption: body.selectedOption, correctOption: 1, isCorrect: body.selectedOption === 1, solution: 'İki doğru cevaptır.' })
    return route.fulfill({ json: { isCorrect: true, correctOption: 1, solution: 'İki doğru cevaptır.' } })
  })
  await page.route('**/api/sessions', async route => {
    expect(route.request().postDataJSON().answers).toHaveLength(20)
    return route.fulfill({ json: { correctCount: 20, wrongCount: 0 } })
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/arena/tani/sosyal-hazirlik')
  const reject = page.getByRole('button', { name: 'Tümünü Reddet' })
  await expect(reject).toBeVisible()
  await reject.click()
  await expect(page.getByRole('heading', { name: 'Cevaplama düzenini seç' })).toBeVisible()
  await page.getByLabel(alternate ? '1–15 + 21–25 (Felsefe)' : '1–15 + 16–20 (Din Kültürü)').check()
  await page.getByRole('checkbox', { name: /Yalnız seçtiğim/ }).check()
  await page.getByRole('button', { name: '20 soruluk turu başlat' }).click()
  for (let i = 1; i <= 20; i++) {
    await expect(page.getByText(`Sentetik soru ${i}`, { exact: true })).toBeVisible()
    await expect(page.getByText('Soru öncülü görünür.')).toBeVisible()
    await expect(page.getByText('İki doğru cevaptır.')).toHaveCount(0)
    await page.getByLabel('B. İki').check()
    await page.getByRole('button', { name: 'Cevabı kaydet' }).click()
    await expect(page.getByText('İki doğru cevaptır.')).toBeVisible()
    if (i < 20) await page.getByRole('button', { name: 'Sonraki soru' }).click()
  }
  await page.getByRole('button', { name: 'Turu tamamla ve kaydet' }).click()
  await expect(page.getByText('20 doğru · 0 yanlış / 20 soru')).toBeVisible()
  for (const size of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(size)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})
