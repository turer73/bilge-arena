'use client'

import { createClient } from '@/lib/supabase/client'
import type { Question, GameType } from '@/types/database'
import { cacheQuestions, getCachedQuestions } from '@/lib/utils/question-cache'

interface FetchQuestionsOptions {
  game: GameType
  limit?: number
  category?: string | null
  difficulty?: number | null
  userId?: string | null
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
 * Supabase'den quiz sorularini ceker, karistirir ve dondurur.
 * Cekilen sorular IndexedDB'ye kaydedilir (offline destek).
 * Ag yoksa veya Supabase hata verirse cache'den sunar.
 */
export async function fetchQuizQuestions({
  game,
  limit = 10,
  category,
  difficulty,
  userId,
}: FetchQuestionsOptions): Promise<Question[]> {
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true

  // Cevrimdisi: dogrudan cache'den sun
  if (!isOnline) {
    const cached = await getCachedQuestions({ game, category, difficulty, limit })
    if (cached.length > 0) return cached
    // Cache de bossa bos dizi don (use-quiz-game DEMO fallback kullanir)
    return []
  }

  // Cevrimici: Supabase'den cek
  const supabase = createClient()

  // --- Son gorulmus sorulari disla (cooldown) ---
  let recentIds: string[] = []
  if (userId) {
    const { data: recentHistory } = await supabase
      .from('user_question_history')
      .select('question_id')
      .eq('user_id', userId)
      .order('last_seen_at', { ascending: false })
      .limit(50)

    if (recentHistory && recentHistory.length > 0) {
      recentIds = recentHistory.map(h => h.question_id)
    }
  }

  // UUID formatini dogrula — type-safe uuid[] icin
  const safeExcludeIds = recentIds.filter(id => /^[0-9a-f-]{36}$/i.test(id))

  // Tam server-side random: select_random_questions RPC (migration 044)
  // ORDER BY random() + SECURITY DEFINER + authenticated EXECUTE.
  // Tum aktif havuzdan limit kadar gercek random; pencere-bias yok, tek roundtrip.
  // Review/spaced-repetition icin extra %30 cektigimizden p_limit'i biraz buyutuyoruz.
  const fetchLimit = Math.min(limit * 2, 50)
  const rpcArgs: {
    p_game: string
    p_limit: number
    p_category?: string
    p_difficulty?: number
    p_exclude_ids?: string[]
  } = {
    p_game: game,
    p_limit: fetchLimit,
  }
  if (category) rpcArgs.p_category = category
  if (difficulty) rpcArgs.p_difficulty = difficulty
  if (safeExcludeIds.length > 0) rpcArgs.p_exclude_ids = safeExcludeIds

  const { data: rpcData, error } = await supabase.rpc('select_random_questions', rpcArgs)
  let data = rpcData as Question[] | null

  // Fallback: cooldown filter sonrasi yeterli soru gelmediyse, exclude'siz tekrar dene
  if (!error && data && data.length < limit && safeExcludeIds.length > 0) {
    const { data: fallbackData, error: fallbackError } = await supabase.rpc(
      'select_random_questions',
      {
        p_game: game,
        p_limit: fetchLimit,
        ...(category ? { p_category: category } : {}),
        ...(difficulty ? { p_difficulty: difficulty } : {}),
      },
    )
    if (!fallbackError && fallbackData && (fallbackData as Question[]).length > data.length) {
      data = fallbackData as Question[]
    }
  }

  if (error || !data || data.length === 0) {
    if (error) console.warn('[fetchQuizQuestions] RPC hata:', error.message)

    // Network hatasi — cache'den dene
    const cached = await getCachedQuestions({ game, category, difficulty, limit })
    if (cached.length > 0) return cached
    return []
  }

  const questions = data as Question[]

  // Arkaplanda cache'e kaydet (await etmeye gerek yok)
  cacheQuestions(questions).catch(() => {})

  // --- Spaced Repetition: yanlis cevaplanan sorulari karistir ---
  if (userId) {
    try {
      const reviewQuestions = await fetchReviewQuestions(supabase, userId, game, category, difficulty)
      if (reviewQuestions.length > 0) {
        const reviewCount = Math.max(1, Math.floor(limit * 0.3)) // %30 tekrar sorusu
        const reviewSlice = shuffle([...reviewQuestions]).slice(0, reviewCount)
        const reviewIds = new Set(reviewSlice.map(q => q.id))
        // Yeni sorulardan tekrar sorulari cikar, sonra birlestir
        const newQuestions = questions.filter(q => !reviewIds.has(q.id))
        const newSlice = shuffle([...newQuestions]).slice(0, limit - reviewSlice.length)
        return shuffle([...reviewSlice, ...newSlice])
      }
    } catch (err) {
      console.warn('[fetchQuizQuestions] Review sorulari alinamadi:', err)
    }
  }

  return shuffle([...questions]).slice(0, limit)
}

/**
 * Son 7 gunde yanlis cevaplanan ve sonrasinda dogru cevaplanmamis sorulari getirir.
 * Spaced repetition icin "zayif sorular" havuzunu olusturur.
 */
async function fetchReviewQuestions(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  game: GameType,
  category?: string | null,
  difficulty?: number | null,
): Promise<Question[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // 1) Son 7 gunde yanlis cevaplanan question_id'leri bul
  const { data: wrongAnswers } = await supabase
    .from('session_answers')
    .select('question_id')
    .eq('user_id', userId)
    .eq('is_correct', false)
    .gte('created_at', sevenDaysAgo)

  if (!wrongAnswers || wrongAnswers.length === 0) return []

  const wrongIds = Array.from(new Set(wrongAnswers.map(a => a.question_id)))

  // 2) Bu sorulardan sonra dogru cevaplananlari cikar
  const { data: correctAfter } = await supabase
    .from('session_answers')
    .select('question_id')
    .eq('user_id', userId)
    .eq('is_correct', true)
    .in('question_id', wrongIds)
    .gte('created_at', sevenDaysAgo)

  const correctedIds = new Set((correctAfter || []).map(a => a.question_id))
  const reviewIds = wrongIds.filter(id => !correctedIds.has(id))

  if (reviewIds.length === 0) return []

  // 3) Bu sorulari questions tablosundan cek
  let query = supabase
    .from('questions')
    .select('*')
    .in('id', reviewIds.slice(0, 20))
    .eq('game', game)
    .eq('is_active', true)

  if (category) query = query.eq('category', category)
  if (difficulty) query = query.eq('difficulty', difficulty)

  const { data } = await query

  return (data as unknown as Question[]) || []
}
