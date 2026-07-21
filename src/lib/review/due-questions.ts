import type { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { Question } from '@/types/database'
import { computeDueMap } from './due-map'

// wrong-answers route'undaki (src/app/api/review/wrong-answers/route.ts) ayni
// tarama-sinirlamasi deseni: cok-aktif kullanicida binlerce satir tek istekte
// cekilmesin.
const FSRS_WRONG_SCAN_LIMIT = 1000

/**
 * FSRS-tabanli review/due havuzu (konu#7 karari S1). Kalici FSRS-state YOK:
 * en az bir kez yanlis cevaplanmis her soru icin TUM (dogru+yanlis)
 * session_answers gecmisi kronolojik olarak FSRS'e katlanir (src/lib/review/fsrs.ts),
 * due<=simdi olanlar donulur.
 *
 * Extract: src/app/api/questions/random/route.ts eski private fetchFsrsDueQuestions
 * govdesi -- artik paylasilan (questions/random + /api/study/today plan-uretimi
 * ayni fold-mantigini kullanir). Davranis AYNEN korunmustur (parity testleri
 * questions/random/__tests__ ile dogrulanir).
 */
export async function fetchDueQuestions(
  admin: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  game: string,
  category: string | null = null,
  difficulty: number | null = null,
): Promise<Question[]> {
  // 1) Adaylar: en az bir kez yanlis cevaplanmis sorular (soru-id'ye gore
  // tekillestirilir asagida; tarama en son N yanlis-OLAYIYLA sinirli).
  const { data: wrongRows } = await admin
    .from('session_answers')
    .select('question_id')
    .eq('user_id', userId)
    .eq('is_correct', false)
    .order('answered_at', { ascending: false })
    .limit(FSRS_WRONG_SCAN_LIMIT)

  const candidateIds = Array.from(new Set((wrongRows ?? []).map(r => r.question_id as string)))
  if (candidateIds.length === 0) return []

  // 2) Bu adaylarin TAM (dogru+yanlis) gecmisi FSRS'e katlanir -- paylasilan
  // yardimci (/api/review/wrong-answers ile ayni fold-mantigini kullanir,
  // due-rozeti icin de burada kullaniliyor).
  const dueMap = await computeDueMap(admin, userId, candidateIds)
  const dueIds = Array.from(dueMap.entries())
    .filter(([, info]) => info.isDue)
    .map(([questionId]) => questionId)

  if (dueIds.length === 0) return []

  // Vercel Agent Review bulgusu: dueIds cross-game bir liste (aday-taramasi
  // game'e gore filtrelenmiyor). game/category/difficulty filtreleri ONCE
  // uygulanip DB-tarafinda limit(20) yapilmali -- aksi halde JS-tarafinda
  // slice(0,20) once yapilirsa cok-oyunlu kullanicida istenen oyuna ait ID
  // kalmayabilir (havuz sessizce ac kalir).
  let query = admin
    .from('questions')
    .select('*')
    .in('id', dueIds)
    .eq('game', game)
    .eq('is_active', true)

  if (category) query = query.eq('category', category)
  if (difficulty) query = query.eq('difficulty', difficulty)

  query = query.limit(20)

  const { data } = await query
  return (data as unknown as Question[]) || []
}
