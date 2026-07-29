import { describe, expect, test } from 'vitest'
import {
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
})
