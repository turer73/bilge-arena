/**
 * Bilge Arena: validateSubmission — UGC gönderim doğrulaması.
 */

import { describe, test, expect } from 'vitest'
import { validateSubmission } from '../question-submission'

const VALID = {
  game: 'matematik',
  category: 'problemler',
  difficulty: 3,
  question: 'Bir sayının %20 fazlası 60 ise sayı kaçtır?',
  options: ['40', '50', '48', '52'],
  answer: 1,
  solution: 'x · 1.2 = 60 → x = 50',
}

describe('validateSubmission', () => {
  test('geçerli gönderim: ok + normalize edilmiş değer', () => {
    const r = validateSubmission(VALID)
    expect(r.ok).toBe(true)
    expect(r.value).toMatchObject({ game: 'matematik', answer: 1 })
  })

  test('geçersiz oyun reddedilir', () => {
    expect(validateSubmission({ ...VALID, game: 'fizik' }).ok).toBe(false)
  })

  test('oyuna ait olmayan kategori reddedilir', () => {
    const r = validateSubmission({ ...VALID, category: 'paragraf' }) // turkce kategorisi
    expect(r.ok).toBe(false)
    expect(r.error).toContain('konu')
  })

  test('zorluk sınırları: 0 ve 6 reddedilir', () => {
    expect(validateSubmission({ ...VALID, difficulty: 0 }).ok).toBe(false)
    expect(validateSubmission({ ...VALID, difficulty: 6 }).ok).toBe(false)
  })

  test('kısa soru metni reddedilir', () => {
    expect(validateSubmission({ ...VALID, question: 'kısa' }).ok).toBe(false)
  })

  test('şık sayısı 4-5 dışında reddedilir', () => {
    expect(validateSubmission({ ...VALID, options: ['a', 'b', 'c'] }).ok).toBe(false)
    expect(validateSubmission({ ...VALID, options: ['a', 'b', 'c', 'd', 'e', 'f'] }).ok).toBe(false)
  })

  test('tekrarlayan şıklar reddedilir (case-insensitive)', () => {
    const r = validateSubmission({ ...VALID, options: ['40', '50', '40', '52'] })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('farklı')
  })

  test('answer şık aralığı dışında reddedilir', () => {
    expect(validateSubmission({ ...VALID, answer: 4 }).ok).toBe(false)
    expect(validateSubmission({ ...VALID, answer: -1 }).ok).toBe(false)
  })

  test('boş solution alanı value içinde yer almaz', () => {
    const r = validateSubmission({ ...VALID, solution: '   ' })
    expect(r.ok).toBe(true)
    expect(r.value).not.toHaveProperty('solution')
  })

  test('5 şık + answer=4 geçerli', () => {
    const r = validateSubmission({ ...VALID, options: ['1', '2', '3', '4', '5'], answer: 4 })
    expect(r.ok).toBe(true)
  })
})
