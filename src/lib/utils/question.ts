import type { Question, QuestionContent } from '@/types/database'

/**
 * Farkli JSON formatlarini normalize eder.
 * TYT JSON: { question, options: [A,B,C,D], answer: "C", solution }
 * DB format: { question, options: [...], answer: 0, solution }
 */
export interface RawTYTQuestion {
  question: string
  options: string[]
  answer: string        // "A", "B", "C", "D"
  solution?: string
}

const LETTER_INDEX: Record<string, number> = {
  A: 0, B: 1, C: 2, D: 3, E: 4,
}

export function normalizeTYTQuestion(raw: RawTYTQuestion): QuestionContent {
  return {
    question: raw.question,
    options: raw.options,
    answer: LETTER_INDEX[raw.answer.toUpperCase()] ?? 0,
    solution: raw.solution,
  }
}

/**
 * Soru seceneklerini karistir ve answer index'ini guncelle.
 * Practice modunda kullanilabilir.
 */
export function shuffleOptions(content: QuestionContent): QuestionContent {
  const indices = content.options.map((_, i) => i)

  // Fisher-Yates shuffle
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }

  const newOptions = indices.map(i => content.options[i])
  const newAnswer = indices.indexOf(content.answer)

  return {
    ...content,
    options: newOptions,
    answer: newAnswer,
  }
}

/**
 * Soru index'ini A/B/C/D harfine donustur
 */
export const INDEX_TO_LETTER = ['A', 'B', 'C', 'D', 'E'] as const

export function getOptionLetter(index: number): string {
  return INDEX_TO_LETTER[index] || String(index + 1)
}

/**
 * Bos soru icerigi (loading/fallback)
 */
export const EMPTY_QUESTION: Question = {
  id: '',
  external_id: null,
  game: 'matematik',
  category: '',
  subcategory: null,
  topic: null,
  difficulty: 2,
  level_tag: null,
  content: {
    question: 'Soru yukleniyor...',
    options: ['', '', '', ''],
    answer: 0,
  },
  base_points: 20,
  is_active: true,
  is_boss: false,
  times_answered: 0,
  times_correct: 0,
  source: 'original',
  exam_ref: null,
  created_at: '',
  updated_at: '',
}
