import { expect, test } from '@playwright/test'

// Optional verified local browser if the pinned CDN download is unavailable.
// CI leaves this unset and installs Playwright's pinned Chromium.
test.use({ launchOptions: { executablePath: process.env.MEASUREMENT_TEST_BROWSER } })

// Synthetic auth/API only. This does not create real learner calibration data.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
for (const exam of ['TYT', 'LGS']) test(`closed measurement ${exam}, small-screen flow`, async ({ page, context }) => {
  test.setTimeout(90000)
  const user = { id: id(800), aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.test',
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2025-01-01T00:00:00Z' }
  const exp = Math.floor(Date.now() / 1000) + 3600
  const jwt = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
    Buffer.from(JSON.stringify({ sub: user.id, exp, aud: 'authenticated', role: 'authenticated' })).toString('base64url'), 'synthetic-not-a-real-signature'].join('.')
  const cookie = 'base64-' + Buffer.from(JSON.stringify({ access_token: jwt, refresh_token: 'synthetic-refresh', expires_at: exp, expires_in: 3600, token_type: 'bearer', user })).toString('base64url')
  await context.addCookies(['placeholder', 'lvnmzdowhfzmpkueurih'].map(ref => ({ name: `sb-${ref}-auth-token`, value: cookie, url: 'http://localhost:3000' })))
  await page.route('**/auth/v1/**', route => route.fulfill({ json: route.request().url().includes('/user') ? user : { access_token: jwt, user, expires_in: 3600, refresh_token: 'synthetic-refresh' } }))
  await page.route('**/api/profile**', route => route.fulfill({ json: { profile: { id: user.id, username: 'synthetic', display_name: 'Sentetik öğrenci', role: 'student', total_xp: 0, coins: 0, exam_ref: exam, onboarding_completed: true } } }))
  await page.route('**/api/backgrounds', route => route.fulfill({ json: { backgrounds: [] } }))
  await page.route('**/api/consent', route => route.fulfill({ json: { success: true } }))
  let answered = 0
  const options = exam === 'LGS' ? ['Bir','İki','Üç','Dört'] : ['Bir','İki','Üç','Dört','Beş']
  const current = () => ({ id: id(1), formId: id(2), game: 'matematik', examRef: exam, examYear: 2027,
    protocol: 'closed-measurement@1', status: answered < 5 ? 'active' : 'completed', answered, questionCount: 5,
    expiresAt: new Date(Date.now()+3600000).toISOString(), calibrated: false,
    question: answered < 5 ? { id: id(10+answered), position: answered+1, text: `Sentetik ölçüm ${answered+1}`, passage: 'Öncül görünür.', options } : null,
    feedback: answered < 5 ? null : Array.from({ length: 5 }, (_, i) => ({ questionId: id(10+i), position: i+1,
      text: `Sentetik ölçüm ${i+1}`, selectedText: 'Bir', correctText: 'Bir', isCorrect: true, solution: 'Tur sonu çözümü.' })),
  })
  await page.route('**/api/study/measurement', async route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { forms: [{ id: id(2), game: 'matematik', examRef: exam, examYear: 2027, questionCount: 5 }], session: null } })
    const body = route.request().postDataJSON()
    if (body.action === 'start') expect(body.noticeAccepted).toBe(true)
    if (body.action === 'answer') { expect(body.position).toBe(answered+1); expect(body.selectedOption).toBe(0); answered++ }
    return route.fulfill({ json: current() })
  })
  let practiceCalls = 0
  await page.route('**/api/questions/grade', route => { practiceCalls++; return route.abort() })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/arena/olcum')
  await page.getByRole('button', { name: 'Tümünü Reddet' }).click()
  await page.getByLabel('Ölçüm formu', { exact: true }).selectOption(id(2))
  await page.getByRole('checkbox', { name: /Açıklamayı okudum/ }).check()
  await page.getByRole('button', { name: 'Turu başlat' }).click()
  for (let position = 1; position <= 5; position++) {
    await expect(page.getByText(`Sentetik ölçüm ${position}`, { exact: true })).toBeVisible()
    await expect(page.getByRole('radio')).toHaveCount(options.length+1)
    await expect(page.getByText('Tur sonu çözümü.')).toHaveCount(0)
    await page.getByRole('button', { name: 'Gösterim durumunu kaydet ve cevapla' }).click()
    await page.getByLabel('A. Bir').check()
    await page.getByRole('button', { name: 'Cevabı kilitle ve devam et' }).click()
  }
  await expect(page.getByRole('heading', { name: 'Tur tamamlandı' })).toBeVisible()
  await expect(page.getByText('Tur sonu çözümü.')).toHaveCount(5)
  expect(practiceCalls).toBe(0)
  for (const size of [{ width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(size)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})
