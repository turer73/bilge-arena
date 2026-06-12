import { GAMES, GAME_SLUGS, type GameSlug } from '@/lib/constants/games'

/** UGC soru gönderimi — server-side doğrulama (zod'suz, repo validator paterni). */

export interface SubmissionInput {
  game: GameSlug
  category: string
  difficulty: number
  question: string
  options: string[]
  answer: number
  solution?: string
}

export interface ValidationResult {
  ok: boolean
  error?: string
  value?: SubmissionInput
}

export function validateSubmission(body: unknown): ValidationResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Geçersiz istek gövdesi' }
  }
  const b = body as Record<string, unknown>

  const game = b.game as GameSlug
  if (typeof game !== 'string' || !GAME_SLUGS.includes(game)) {
    return { ok: false, error: 'Geçerli bir oyun seçin' }
  }

  const category = b.category
  if (typeof category !== 'string' || !GAMES[game].categories.includes(category)) {
    return { ok: false, error: 'Geçerli bir konu seçin' }
  }

  const difficulty = Number(b.difficulty)
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
    return { ok: false, error: 'Zorluk 1-5 arasında olmalı' }
  }

  const question = typeof b.question === 'string' ? b.question.trim() : ''
  if (question.length < 10 || question.length > 600) {
    return { ok: false, error: 'Soru metni 10-600 karakter olmalı' }
  }

  const rawOptions = Array.isArray(b.options) ? b.options : []
  const options = rawOptions.map((o) => (typeof o === 'string' ? o.trim() : ''))
  if (options.length < 4 || options.length > 5) {
    return { ok: false, error: 'Şık sayısı 4 veya 5 olmalı' }
  }
  if (options.some((o) => o.length < 1 || o.length > 200)) {
    return { ok: false, error: 'Her şık 1-200 karakter olmalı' }
  }
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
    return { ok: false, error: 'Şıklar birbirinden farklı olmalı' }
  }

  const answer = Number(b.answer)
  if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) {
    return { ok: false, error: 'Doğru cevap şıklardan biri olmalı' }
  }

  const solution = typeof b.solution === 'string' ? b.solution.trim() : ''
  if (solution.length > 1200) {
    return { ok: false, error: 'Çözüm açıklaması en fazla 1200 karakter olmalı' }
  }

  return {
    ok: true,
    value: {
      game,
      category,
      difficulty,
      question,
      options,
      answer,
      ...(solution ? { solution } : {}),
    },
  }
}
