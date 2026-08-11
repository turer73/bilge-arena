'use client'

import type { GameMode, GameType } from '@/types/database'
import type { PublicQuestion } from '@/lib/utils/question-public'
import { cacheQuestions } from '@/lib/utils/question-cache'
import { filterValidUuids, isValidUuid } from '@/lib/utils/uuid'

interface FetchQuestionsOptions {
  game: GameType
  limit?: number
  category?: string | null
  difficulty?: number | null
  /** Cooldown icin son gorulen soru ID'leri (max 50, client state'inden) */
  excludeIds?: string[]
  /** 'TYT' | 'LGS' | 'AYT-SAY' | 'AYT-EA' | 'AYT-SOZ' | null (null = tumu) */
  examRef?: string | null
  /** Spaced-repetition: yanlis cevaplanip dogrulanmamis sorulari ek olarak iste */
  includeReview?: boolean
  /** Dogrulanmis deneme biletine baglanacak oyun modu */
  mode?: GameMode
}

interface RandomQuestionsResponse {
  questions: PublicQuestion[]
  reviewQuestions: PublicQuestion[]
  attemptId?: string | null
  expiresAt?: string | null
}

export interface VerifiedQuestionSet {
  questions: PublicQuestion[]
  attemptId: string | null
  expiresAt: string | null
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
 * Cekilen guvenli soru metinleri IndexedDB'ye kaydedilir. Notlandirma sunucu
 * otoriter oldugu icin cevrimdisiyken cache oynatilmaz; aksi halde cevap
 * dogrulanamaz ve oturum ilerleyemez.
 *
 * Anon kullanici icin 401 doner -> use-quiz-game preview akisi kullanilir.
 */
export async function fetchQuizQuestions({
  game,
  limit = 10,
  category,
  difficulty,
  excludeIds = [],
  examRef,
  includeReview = true,
  mode = 'classic',
}: FetchQuestionsOptions): Promise<VerifiedQuestionSet> {
  const emptyResult: VerifiedQuestionSet = {
    questions: [],
    attemptId: null,
    expiresAt: null,
  }
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true

  if (!isOnline) return emptyResult

  const params = new URLSearchParams({
    game,
    limit: String(limit),
    mode,
  })
  if (category) params.set('category', category)
  if (difficulty != null) params.set('difficulty', String(difficulty))
  if (examRef) params.set('examRef', examRef)
  if (includeReview) params.set('includeReview', 'true')

  const safeExcludeIds = filterValidUuids(excludeIds, 50)
  if (safeExcludeIds.length > 0) {
    params.set('excludeIds', safeExcludeIds.join(','))
  }

  let response: RandomQuestionsResponse | null = null
  try {
    const res = await fetch(`/api/questions/random?${params.toString()}`, {
      cache: 'no-store',
    })
    if (res.ok) response = (await res.json()) as RandomQuestionsResponse
  } catch (err) {
    console.warn('[fetchQuizQuestions] API hata:', err)
  }

  const questions = response?.questions ?? []
  const reviewQuestions = response?.reviewQuestions ?? []
  if (questions.length === 0) return emptyResult

  const attemptId = response?.attemptId
  const expiresAt = response?.expiresAt
  if (
    typeof attemptId !== 'string' ||
    !isValidUuid(attemptId) ||
    typeof expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    Date.parse(expiresAt) <= Date.now()
  ) {
    return emptyResult
  }

  cacheQuestions(questions).catch(() => {})

  if (reviewQuestions.length > 0) {
    const reviewCount = Math.max(1, Math.floor(limit * 0.3))
    const reviewSlice = shuffle([...reviewQuestions]).slice(0, reviewCount)
    const reviewIds = new Set(reviewSlice.map(question => question.id))
    const newQuestions = questions.filter(question => !reviewIds.has(question.id))
    const newSlice = shuffle([...newQuestions]).slice(0, limit - reviewSlice.length)
    return {
      questions: shuffle([...reviewSlice, ...newSlice]),
      attemptId,
      expiresAt,
    }
  }

  return {
    questions: shuffle([...questions]).slice(0, limit),
    attemptId,
    expiresAt,
  }
}

interface PreviewQuestionsResponse {
  question?: PublicQuestion | null
  questions?: PublicQuestion[]
}

/** Misafir onizleme: auth olmadan en fazla 3 gercek soru doner. */
export async function fetchPreviewQuestions(
  game: string,
  opts?: {
    category?: string | null
    difficulty?: number | null
    examRef?: string | null
    activation?: boolean
  },
): Promise<PublicQuestion[]> {
  try {
    const params = new URLSearchParams({ game })
    if (opts?.category) params.set('category', opts.category)
    if (opts?.difficulty != null) params.set('difficulty', String(opts.difficulty))
    if (opts?.examRef) params.set('examRef', opts.examRef)
    if (opts?.activation) params.set('activation', '1')

    const res = await fetch(`/api/questions/preview?${params.toString()}`, { cache: 'no-store' })
    if (!res.ok) return []
    const data = await res.json() as PreviewQuestionsResponse
    if (Array.isArray(data.questions)) return data.questions.slice(0, 3)
    return data.question ? [data.question] : []
  } catch {
    return []
  }
}

/** Geriye uyumlu tek-soru yardimcisi. */
export async function fetchPreviewQuestion(
  game: string,
  opts?: { category?: string | null; difficulty?: number | null; examRef?: string | null },
): Promise<PublicQuestion | null> {
  const questions = await fetchPreviewQuestions(game, opts)
  return questions[0] ?? null
}
