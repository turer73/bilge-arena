/**
 * Bilge Arena: toPublicQuestion — soru API whitelist'i.
 * Telemetri/iç alanlar (times_answered, times_correct, is_active, source,
 * external_id...) ve cevap anahtarı yanıttan düşmeli; soru metni korunmalı.
 */

import { describe, test, expect } from 'vitest'
import {
  parsePublicQuestionContent,
  parseQuestionContent,
  parseQuestionRows,
  toDomainQuestion,
  toPublicQuestion,
} from '../question-public'
import type { Question } from '@/types/database'
import type { QuestionRow } from '../question-public'

const DB_ROW = {
  id: 'q-1',
  external_id: 'ext-123',
  game: 'matematik',
  category: 'problemler',
  subcategory: 'Faiz Problemleri',
  topic: 'bileşik faiz',
  difficulty: 5,
  level_tag: null,
  content: { question: 'Soru?', options: ['a', 'b', 'c', 'd'], answer: 2, solution: 'Çözüm.' },
  base_points: 50,
  // İç/telemetri alanları — SIZMAMALI
  is_active: true,
  source: 'ai-gen-v3',
  times_answered: 1234,
  times_correct: 567,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
} as unknown as Question

describe('toPublicQuestion', () => {
  test('oynanabilir alanları korur, cevap anahtarı ve çözümü düşürür', () => {
    const pub = toPublicQuestion(DB_ROW)
    expect(pub).toEqual({
      id: 'q-1',
      game: 'matematik',
      category: 'problemler',
      subcategory: 'Faiz Problemleri',
      topic: 'bileşik faiz',
      difficulty: 5,
      level_tag: null,
      content: {
        question: 'Soru?',
        options: ['a', 'b', 'c', 'd'],
      },
      base_points: 50,
    })
  })

  test('answer/solution/explanation/hint içerikten istemciye sızmaz', () => {
    const question = {
      ...DB_ROW,
      content: {
        ...DB_ROW.content,
        hint: 'İpucu',
        explanation: 'Açıklama',
      },
    }
    const content = toPublicQuestion(question).content as Record<string, unknown>
    for (const leak of ['answer', 'solution', 'explanation', 'hint']) {
      expect(content).not.toHaveProperty(leak)
    }
  })

  test('telemetri/iç alanları düşürür', () => {
    const pub = toPublicQuestion(DB_ROW) as Record<string, unknown>
    for (const leak of ['times_answered', 'times_correct', 'is_active', 'source', 'external_id', 'created_at', 'updated_at']) {
      expect(pub).not.toHaveProperty(leak)
    }
  })

  test('alan sayısı sabit: yeni DB kolonu eklenirse otomatik sızmaz', () => {
    expect(Object.keys(toPublicQuestion(DB_ROW))).toHaveLength(9)
  })
})

const GENERATED_ROW = {
  id: 'q-generated',
  external_id: null,
  game: 'matematik',
  category: 'problemler',
  subcategory: null,
  topic: null,
  difficulty: 3,
  level_tag: null,
  content: { question: '2 + 2?', options: ['3', '4'], answer: 1 },
  base_points: null,
  is_active: null,
  is_boss: null,
  times_answered: null,
  times_correct: null,
  source: null,
  exam_ref: null,
  published_revision_id: null,
  created_at: null,
  updated_at: null,
} satisfies QuestionRow

describe('generated question boundary', () => {
  test('maps nullable generated fields to safe domain defaults', () => {
    expect(toDomainQuestion(GENERATED_ROW)).toMatchObject({
      id: 'q-generated',
      difficulty: 3,
      base_points: 30,
      is_active: true,
      is_boss: false,
      times_answered: 0,
      times_correct: 0,
      source: 'unknown',
    })
  })

  test('rejects malformed JSON content instead of casting it', () => {
    expect(parseQuestionContent({ question: 'Broken', options: ['only-one'], answer: 4 })).toBeNull()
    expect(parseQuestionRows([{ ...GENERATED_ROW, content: { unexpected: true } }])).toEqual([])
  })
})

/**
 * Migration 157: `search_questions` admin olmayan dalda cevap anahtarını
 * veritabanında kırpıyor. Listeleme yolu bu kırpılmış içerikle çalışmak
 * zorunda; `answer` zorunlu tutulursa her satır sessizce düşerdi.
 */
describe('parsePublicQuestionContent', () => {
  test('cevap anahtarı kırpılmış içeriği kabul eder (migration 157 şekli)', () => {
    expect(parsePublicQuestionContent({
      question: 'Soru?',
      options: ['a', 'b', 'c', 'd'],
      sentence: 'Cümle',
      type: 'multiple_choice',
    })).toEqual({
      question: 'Soru?',
      options: ['a', 'b', 'c', 'd'],
      sentence: 'Cümle',
      type: 'multiple_choice',
    })
  })

  test('cevap anahtarı hâlâ gelse bile dışarı taşımaz (ikinci katman)', () => {
    const pub = parsePublicQuestionContent({
      question: 'Soru?',
      options: ['a', 'b', 'c', 'd'],
      answer: 2,
      solution: 'Çözüm.',
      explanation: 'Açıklama.',
      hint: 'İpucu.',
    })
    expect(pub).toEqual({ question: 'Soru?', options: ['a', 'b', 'c', 'd'] })
    expect(pub).not.toHaveProperty('answer')
    expect(pub).not.toHaveProperty('solution')
    expect(pub).not.toHaveProperty('explanation')
    expect(pub).not.toHaveProperty('hint')
  })

  test('bozuk içeriği reddeder', () => {
    expect(parsePublicQuestionContent({ question: 'Broken', options: ['only-one'] })).toBeNull()
    expect(parsePublicQuestionContent({ unexpected: true })).toBeNull()
    // answer geldiyse hâlâ seçenek sınırını aşmamalı
    expect(parsePublicQuestionContent({ question: 'S', options: ['a', 'b'], answer: 5 })).toBeNull()
  })
})
