import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkPermission } from '@/lib/supabase/admin'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * GET /api/admin/question-quality — "Production drift" soru kalite kuyrugu (#378 Tier 2).
 *
 * Gercek kullanici cevap verisinden (questions.times_answered/times_correct
 * sayaclari) DUSUK BASARILI sorulari yuzeye cikarir + soru basina bekleyen
 * error_reports sayisini ekler. Iki kalite sinyalini (istatistik + kullanici
 * raporu) tek admin ekraninda birlestirir.
 *
 * Query: minAnswered (varsayilan 20), maxRate (% varsayilan 50), limit (50).
 * Yetki: admin.questions.view. Veri service-role ile okunur (admin gate sonrasi).
 */

// PostgREST hesaplanan oran uzerinden ORDER BY yapamaz; aday havuzunu en cok
// oynanan (en guvenilir ornekleme) ile sinirlandirip JS tarafinda siralariz.
const CANDIDATE_CAP = 500

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  const n = parseInt(raw ?? String(fallback))
  if (isNaN(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

interface QuestionRow {
  id: string
  game: string
  category: string
  subcategory: string | null
  difficulty: number
  is_active: boolean
  content: { question?: string; sentence?: string } | null
  times_answered: number
  times_correct: number
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const admin = await checkPermission(supabase, 'admin.questions.view')
  if (!admin) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const minAnswered = clampInt(searchParams.get('minAnswered'), 1, 100000, 20)
  const maxRate = clampInt(searchParams.get('maxRate'), 0, 100, 50)
  const limit = clampInt(searchParams.get('limit'), 1, 200, 50)

  const svc = createServiceRoleClient()

  const { data: rows, error } = await svc
    .from('questions')
    .select('id, game, category, subcategory, difficulty, is_active, content, times_answered, times_correct')
    .gte('times_answered', minAnswered)
    .order('times_answered', { ascending: false })
    .limit(CANDIDATE_CAP)

  if (error) {
    console.error('[admin/question-quality] query error:', error.message)
    return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
  }

  // Bekleyen rapor sayilari (soru basina) — ikinci kalite sinyali.
  const { data: reps, error: repErr } = await svc
    .from('error_reports')
    .select('question_id')
    .eq('status', 'pending')
  if (repErr) {
    console.error('[admin/question-quality] reports error:', repErr.message)
    return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
  }
  const reportCounts = new Map<string, number>()
  for (const r of (reps ?? []) as Array<{ question_id: string }>) {
    reportCounts.set(r.question_id, (reportCounts.get(r.question_id) ?? 0) + 1)
  }

  // P2a fix (Codex PR#242): rapor edilen sorular drift-örneklemesinin (times_answered
  // >= minAnswered, top-500) DIŞINDA kalmış olabilir — bu durumda pending_reports>0
  // filtresine hiç ulaşamıyor, kuyrukta görünmüyordu. Eksik rapor-soru satırlarını
  // örnekleme eşiklerinden BAĞIMSIZ ayrıca çek.
  const driftRows = (rows ?? []) as QuestionRow[]
  const driftIds = new Set(driftRows.map((r) => r.id))
  // P2 fix (Codex PR#245): IN-filter'ı CAP'le. Çok pending-rapor örnekleme dışındaysa
  // yüzlerce UUID tek Supabase .in() URL-query'sine gömülür → bu admin endpoint TAM bu
  // anda (rapor kuyruğu büyüdüğünde) 500/çok-yavaş olur. İlk CANDIDATE_CAP rapor-id'si
  // yeterli (kuyruk zaten en fazla `limit` gösterir, raporlular önceliklendirilir).
  const reportedOutsideDrift = [...reportCounts.keys()].filter((id) => !driftIds.has(id))
  const reportedCapped = reportedOutsideDrift.length > CANDIDATE_CAP
  const missingReportedIds = reportedOutsideDrift.slice(0, CANDIDATE_CAP)
  let extraRows: QuestionRow[] = []
  if (missingReportedIds.length > 0) {
    const { data: extra, error: extraErr } = await svc
      .from('questions')
      .select('id, game, category, subcategory, difficulty, is_active, content, times_answered, times_correct')
      .in('id', missingReportedIds)
    if (extraErr) {
      console.error('[admin/question-quality] reported-rows error:', extraErr.message)
      return NextResponse.json({ error: 'Sorgu basarisiz' }, { status: 500 })
    }
    extraRows = (extra ?? []) as QuestionRow[]
  }

  const candidates = [...driftRows, ...extraRows]
  const questions = candidates
    .map((q) => {
      const rate = q.times_answered > 0
        ? Math.round((q.times_correct / q.times_answered) * 1000) / 10
        : 0
      return {
        id: q.id,
        game: q.game,
        category: q.category,
        subcategory: q.subcategory,
        difficulty: q.difficulty,
        is_active: q.is_active,
        // Ham metin; client (stripRichText) ile gosterir — sorular sayfasiyla ayni.
        question_text: q.content?.question ?? q.content?.sentence ?? '',
        times_answered: q.times_answered,
        times_correct: q.times_correct,
        success_rate: rate,
        pending_reports: reportCounts.get(q.id) ?? 0,
      }
    })
    // Drift = dusuk basari VEYA bekleyen kullanici raporu.
    .filter((q) => q.success_rate < maxRate || q.pending_reports > 0)
    // P2b fix (Codex PR#242): bekleyen raporu olanlar ÖNCE — yalnız success_rate
    // sıralayıp slice edince sağlıklı-oranlı bir rapor düşük-başarılıların arkasına
    // düşüp limit'te kesiliyordu (kuyruk raporları güvenilir göstermiyordu).
    .sort((a, b) => {
      const aRep = a.pending_reports > 0 ? 1 : 0
      const bRep = b.pending_reports > 0 ? 1 : 0
      if (aRep !== bRep) return bRep - aRep
      return a.success_rate - b.success_rate
    })
    .slice(0, limit)

  return NextResponse.json({
    questions,
    minAnswered,
    maxRate,
    // Aday havuzu CAP'e degdiyse daha dusuk-oynanmali drift sorular kapsam disi
    // kalmis olabilir — UI bunu bildirir (sessiz kesme yok). NOT: rapor-soru
    // ek satırları capped sinyalini şişirmesin → yalnız drift örneklemesine bak.
    // P2 (Codex PR#245): rapor-id'leri de CAP'lendiyse (>CANDIDATE_CAP) bunu da bildir.
    capped: driftRows.length >= CANDIDATE_CAP || reportedCapped,
  })
}
