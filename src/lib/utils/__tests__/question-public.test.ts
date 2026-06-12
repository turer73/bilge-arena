/**
 * Bilge Arena: toPublicQuestion — soru API whitelist'i.
 * Telemetri/iç alanlar (times_answered, times_correct, is_active, source,
 * external_id...) yanıttan düşmeli; quiz'in kullandığı alanlar korunmalı.
 */

import { describe, test, expect } from 'vitest'
import { toPublicQuestion } from '../question-public'
import type { Question } from '@/types/database'

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
  test('quiz alanlarını korur (content answer/solution dahil — misafir notlaması client-side)', () => {
    const pub = toPublicQuestion(DB_ROW)
    expect(pub).toEqual({
      id: 'q-1',
      game: 'matematik',
      category: 'problemler',
      subcategory: 'Faiz Problemleri',
      topic: 'bileşik faiz',
      difficulty: 5,
      level_tag: null,
      content: DB_ROW.content,
      base_points: 50,
    })
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
