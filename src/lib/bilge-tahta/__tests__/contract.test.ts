import { afterEach, describe, expect, test } from 'vitest'
import { isBilgeTahtaEnabled } from '../client'
import { parseBilgeTahtaLesson } from '../contract'

const previousFlag = process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED

afterEach(() => {
  if (previousFlag === undefined) delete process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED
  else process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED = previousFlag
})

describe('Bilge Tahta contract', () => {
  test('metni normalize eder ve yalnız tanımlı alanları kabul eder', () => {
    const lesson = parseBilgeTahtaLesson({
      mode: 'study',
      subjectLabel: ' Matematik - LGS ',
      title: 'Kareköklü İfadeler',
      steps: [{
        id: 'concept-1',
        stage: 'concept',
        title: 'Tam kare sayılar',
        content: 'Birinci satır\r\nİkinci satır\u0000',
        formula: '√36 = 6',
        unexpectedHtml: '<script>alert(1)</script>',
      }],
    })

    expect(lesson.subjectLabel).toBe('Matematik - LGS')
    expect(lesson.steps[0].content).toBe('Birinci satır\nİkinci satır')
    expect(lesson.steps[0]).not.toHaveProperty('unexpectedHtml')
  })

  test('boş adım dizisini ve sözleşme dışı aşamayı reddeder', () => {
    expect(() => parseBilgeTahtaLesson({
      mode: 'game', subjectLabel: 'Matematik', title: 'Konu', steps: [],
    })).toThrow()
    expect(() => parseBilgeTahtaLesson({
      mode: 'game',
      subjectLabel: 'Matematik',
      title: 'Konu',
      steps: [{ id: 'x', stage: 'answer-leak', title: 'Yanıt', content: '42' }],
    })).toThrow()
  })
})

describe('Bilge Tahta feature flag', () => {
  test('varsayılan kapalıdır ve yalnız tam true ile açılır', () => {
    delete process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED
    expect(isBilgeTahtaEnabled()).toBe(false)
    process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED = 'false'
    expect(isBilgeTahtaEnabled()).toBe(false)
    process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED = 'true'
    expect(isBilgeTahtaEnabled()).toBe(true)
  })
})
