import { describe, expect, test } from 'vitest'
import {
  supportsGuidedCoachQuestion,
  supportsStagedCoachPublicQuestion,
  supportsStagedCoachQuestion,
} from '../question-shape'

const publicContent = { question: '2 + 2?', options: ['3', '4'] }

describe('staged coach question shape', () => {
  test('client eligibility answer anahtarı olmadan çalışır', () => {
    expect(supportsStagedCoachPublicQuestion(publicContent)).toBe(true)
    expect(supportsStagedCoachQuestion(publicContent)).toBe(false)
  })

  test('server eligibility geçerli answer anahtarı ister', () => {
    expect(supportsStagedCoachQuestion({ ...publicContent, answer: 1 })).toBe(true)
    expect(supportsStagedCoachQuestion({ ...publicContent, answer: 2 })).toBe(false)
  })

  test('R2.2 akışı küratörlü çözüm ve tam coach metadata ister', () => {
    expect(supportsGuidedCoachQuestion({
      ...publicContent,
      answer: 1,
      solution: 'İki ile iki toplanır.',
      coach: {
        misconceptions: ['Bir eksik sayılmış olabilir.', null],
        hint1: 'İki grubu birleştir.',
      },
    })).toBe(true)
    expect(supportsGuidedCoachQuestion({ ...publicContent, answer: 1 })).toBe(false)
    expect(supportsGuidedCoachQuestion({
      ...publicContent,
      answer: 1,
      solution: 'Çözüm',
      coach: { misconceptions: ['Tek kayıt'] },
    })).toBe(false)
  })

  test('doğru seçenekte yalnız null, yanlış seçeneklerde dolu metin kabul eder', () => {
    const base = {
      ...publicContent,
      answer: 1,
      solution: 'İki ile iki toplanır.',
    }

    expect(supportsGuidedCoachQuestion({
      ...base,
      coach: { misconceptions: ['Yanlış seçenek açıklaması.', null] },
    })).toBe(true)
    expect(supportsGuidedCoachQuestion({
      ...base,
      coach: { misconceptions: ['Yanlış seçenek açıklaması.', 'Doğru seçenek açıklaması.'] },
    })).toBe(false)
    expect(supportsGuidedCoachQuestion({
      ...base,
      coach: { misconceptions: [null, null] },
    })).toBe(false)
    expect(supportsGuidedCoachQuestion({
      ...base,
      coach: { misconceptions: ['', null] },
    })).toBe(false)
  })
})
