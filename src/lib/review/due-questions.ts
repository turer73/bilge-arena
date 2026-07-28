import type { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { Question } from '@/types/database'
import { computeDueMap } from './due-map'
import { parseQuestionRows } from '@/lib/utils/question-public'

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
  examRef: string | null = null,
): Promise<Question[]> {
  // 1) Adaylar: en az bir kez yanlis cevaplanmis sorular (soru-id'ye gore
  // tekillestirilir asagida; tarama en son N yanlis-OLAYIYLA sinirli).
  // Game-scope ONCE, 1000-cap SONRA (Codex P2): cok-oyunlu aktif kullanicinin
  // son 1000 yanlis-olayi baska oyunlardan ibaretse, game filtresi cap'ten SONRA
  // uygulaninca istenen oyunun due sorulari sessizce dislaniyor ve plan due kotasi
  // weak/new ile doluyordu. questions!inner join ile tarama game'e daraltilir --
  // limit artik game-ici son 1000 yanlisa uygulanir.
  const { data: wrongRows, error: wrongError } = await admin
    .from('session_answers')
    .select('question_id, questions!inner(game)')
    .eq('user_id', userId)
    .eq('is_correct', false)
    .eq('questions.game', game)
    .order('answered_at', { ascending: false })
    .limit(FSRS_WRONG_SCAN_LIMIT)

  if (wrongError) throw wrongError

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
  if (examRef) query = query.eq('exam_ref', examRef)

  query = query.limit(20)

  const { data, error } = await query
  if (error) throw error
  return parseQuestionRows(data)
}
