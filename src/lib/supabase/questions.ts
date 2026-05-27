'use client'

import type { Question, GameType } from '@/types/database'
import { cacheQuestions, getCachedQuestions } from '@/lib/utils/question-cache'
import { filterValidUuids } from '@/lib/utils/uuid'

interface FetchQuestionsOptions {
  game: GameType
  limit?: number
  category?: string | null
  difficulty?: number | null
  /** Cooldown icin son gorulen soru ID'leri (max 50, client state'inden) */
  excludeIds?: string[]
  /** 'TYT' | 'LGS' | 'AYT-SAY' | 'AYT-EA' | 'AYT-SOZ' | null (null = tümü) */
  examRef?: string | null
  /** Spaced-repetition: yanlis cevaplanip dogrulanmamis sorulari ek olarak iste */
  includeReview?: boolean
}

interface RandomQuestionsResponse {
  questions: Question[]
  reviewQuestions: Question[]
}

/** Fisher-Yates shuffle (in-place) */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * /api/questions/random API'sinden quiz sorularini ceker, karistirir ve dondurur.
 * Madde 9 #6: eski client `supabase.rpc('select_random_questions')` yerine proxy.
 *
 * Cekilen sorular IndexedDB'ye kaydedilir (offline destek).
 * Ag yoksa veya API hata verirse cache'den sunar.
 *
 * Anon kullanici icin 401 doner -> use-quiz-game DEMO_QUESTIONS fallback (mevcut akis).
 */
export async function fetchQuizQuestions({
  game,
  limit = 10,
  category,
  difficulty,
  excludeIds = [],
  examRef,
  includeReview = true,
}: FetchQuestionsOptions): Promise<Question[]> {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true

  // Cevrimdisi: dogrudan cache'den sun
  if (!isOnline) {
    const cached = await getCachedQuestions({ game, category, difficulty, limit })
    if (cached.length > 0) return cached
    return []
  }

  // Cevrimici: API'den cek
  const params = new URLSearchParams({
    game,
    limit: String(limit),
  })
  if (category) params.set('category', category)
  if (difficulty != null) params.set('difficulty', String(difficulty))
  if (examRef) params.set('examRef', examRef)
  if (includeReview) params.set('includeReview', 'true')

  // Klipper review B3/P1: UUID validation ortak helper'da (src/lib/utils/uuid.ts).
  const safeExcludeIds = filterValidUuids(excludeIds, 50)
  if (safeExcludeIds.length > 0) {
    params.set('excludeIds', safeExcludeIds.join(','))
  }

  let response: RandomQuestionsResponse | null = null
  try {
    const res = await fetch(`/api/questions/random?${params.toString()}`, {
      cache: 'no-store',
    })
    if (res.ok) {
      response = (await res.json()) as RandomQuestionsResponse
    }
  } catch (err) {
    console.warn('[fetchQuizQuestions] API hata:', err)
  }

  const questions = response?.questions ?? []
  const reviewQuestions = response?.reviewQuestions ?? []

  if (questions.length === 0) {
    // Anon (401) veya network hatasi — cache'den dene
    const cached = await getCachedQuestions({ game, category, difficulty, limit })
    if (cached.length > 0) return cached
    return []
  }

  // Arkaplanda cache'e kaydet
  cacheQuestions(questions).catch(() => {})

  // Spaced repetition: review sorulari ile karistir (%30 review)
  if (reviewQuestions.length > 0) {
    const reviewCount = Math.max(1, Math.floor(limit * 0.3))
    const reviewSlice = shuffle([...reviewQuestions]).slice(0, reviewCount)
    const reviewIds = new Set(reviewSlice.map(q => q.id))
    const newQuestions = questions.filter(q => !reviewIds.has(q.id))
    const newSlice = shuffle([...newQuestions]).slice(0, limit - reviewSlice.length)
    return shuffle([...reviewSlice, ...newSlice])
  }

  return shuffle([...questions]).slice(0, limit)
}

/**
 * Misafir önizleme: auth olmadan 1 gerçek soru döner.
 * Kayıtsız kullanıcıya tek soru göstermek için kullanılır.
 */
export async function fetchPreviewQuestion(game: string): Promise<Question | null> {
  try {
    const res = await fetch(
      `/api/questions/preview?game=${encodeURIComponent(game)}`,
      { cache: 'no-store' },
    )
    if (!res.ok) return null
    const data = await res.json() as { question: Question | null }
    return data.question ?? null
  } catch {
    return null
  }
}
