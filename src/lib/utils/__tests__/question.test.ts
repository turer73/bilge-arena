import { describe, it, expect } from 'vitest'
import {
  normalizeTYTQuestion,
  shuffleOptions,
  getOptionLetter,
  INDEX_TO_LETTER,
  EMPTY_QUESTION,
} from '../question'
import type { QuestionContent } from '@/types/database'

// ─── normalizeTYTQuestion ──────────────────────────────

describe('normalizeTYTQuestion', () => {
  it('harf cevabi index\'e cevirmeli', () => {
    const result = normalizeTYTQuestion({
      question: 'Soru?',
      options: ['A secenegi', 'B secenegi', 'C secenegi', 'D secenegi'],
      answer: 'C',
    })

    expect(result.answer).toBe(2) // C = index 2
    expect(result.question).toBe('Soru?')
    expect(result.options).toHaveLength(4)
  })

  it('kucuk harf cevabi da desteklemeli', () => {
    const result = normalizeTYTQuestion({
      question: 'Test?',
      options: ['1', '2', '3', '4'],
      answer: 'b',
    })
    expect(result.answer).toBe(1) // B = index 1
  })

  it('tum harfleri dogru maple etmeli', () => {
    expect(normalizeTYTQuestion({ question: '', options: ['','','',''], answer: 'A' }).answer).toBe(0)
    expect(normalizeTYTQuestion({ question: '', options: ['','','',''], answer: 'B' }).answer).toBe(1)
    expect(normalizeTYTQuestion({ question: '', options: ['','','',''], answer: 'C' }).answer).toBe(2)
    expect(normalizeTYTQuestion({ question: '', options: ['','','',''], answer: 'D' }).answer).toBe(3)
  })

  it('gecersiz harf icin 0 dondurmeli', () => {
    const result = normalizeTYTQuestion({
      question: 'Test?',
      options: ['1', '2', '3', '4'],
      answer: 'Z', // gecersiz
    })
    expect(result.answer).toBe(0)
  })

  it('solution alanini korumali', () => {
    const result = normalizeTYTQuestion({
      question: 'Soru?',
      options: ['a', 'b', 'c', 'd'],
      answer: 'A',
      solution: 'Cunku oyle',
    })
    expect(result.solution).toBe('Cunku oyle')
  })
})

// ─── shuffleOptions ────────────────────────────────────

describe('shuffleOptions', () => {
  const content: QuestionContent = {
    question: 'Test?',
    options: ['A', 'B', 'C', 'D'],
    answer: 2, // C dogru
  }

  it('tum secenekleri korumali', () => {
    const result = shuffleOptions(content)
    expect(result.options).toHaveLength(4)
    expect(result.options.sort()).toEqual(['A', 'B', 'C', 'D'])
  })

  it('dogru cevap index\'ini guncellemeli', () => {
    const result = shuffleOptions(content)
    // Karistirma sonrasi dogru cevap hala 'C' olmali
    expect(result.options[result.answer]).toBe('C')
  })

  it('soru metnini degistirmemeli', () => {
    const result = shuffleOptions(content)
    expect(result.question).toBe('Test?')
  })

  it('orijinal icerige dokunmamali (immutability)', () => {
    const original = { ...content, options: [...content.options] }
    shuffleOptions(content)
    expect(content.options).toEqual(original.options)
    expect(content.answer).toBe(original.answer)
  })
})

// ─── getOptionLetter ───────────────────────────────────

describe('getOptionLetter', () => {
  it('0-4 arasi index\'leri harfe dondurmeli', () => {
    expect(getOptionLetter(0)).toBe('A')
    expect(getOptionLetter(1)).toBe('B')
    expect(getOptionLetter(2)).toBe('C')
    expect(getOptionLetter(3)).toBe('D')
    expect(getOptionLetter(4)).toBe('E')
  })

  it('sinir disindaki index icin sayi dondurmeli', () => {
    expect(getOptionLetter(5)).toBe('6') // 5+1
    expect(getOptionLetter(10)).toBe('11')
  })
})

// ─── INDEX_TO_LETTER ───────────────────────────────────

describe('INDEX_TO_LETTER', () => {
  it('5 harf icermeli', () => {
    expect(INDEX_TO_LETTER).toEqual(['A', 'B', 'C', 'D', 'E'])
  })
})

// ─── EMPTY_QUESTION ────────────────────────────────────

describe('EMPTY_QUESTION', () => {
  it('fallback soru yapisinda olmali', () => {
    expect(EMPTY_QUESTION.id).toBe('')
    expect(EMPTY_QUESTION.game).toBe('matematik')
    expect(EMPTY_QUESTION.content.options).toHaveLength(4)
    expect(EMPTY_QUESTION.content.answer).toBe(0)
    expect(EMPTY_QUESTION.is_active).toBe(true)
  })
})
