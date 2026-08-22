// Soru hata-raporu gönderimi (client helper). quiz-engine inline onSubmit'ten
// çıkarıldı (test-edilebilir + tek-sorumluluk). #379 + Codex PR#242 P1: çağıran
// sonucu AWAIT eder; {ok:false} dönerse modal HATA gösterir (sahte başarı yok).

export type ReportSubmitResult = { ok: true } | { ok: false; error: string }

const APPEAL_REASONS: Record<string, 'wrong_key' | 'ambiguous' | 'invalid_content' | 'other'> = {
  wrong_answer: 'wrong_key',
  unclear: 'ambiguous',
  typo: 'invalid_content',
  offensive: 'invalid_content',
  duplicate: 'other',
  other: 'other',
}

export async function submitQuestionReport(
  questionId: string,
  data: { type: string; description: string },
  context: { attemptId?: string | null } = {},
): Promise<ReportSubmitResult> {
  try {
    const appealsEnabled = process.env.NEXT_PUBLIC_CONTENT_APPEALS_ENABLED === 'true'
    const requestId = crypto.randomUUID()
    const res = await fetch(appealsEnabled ? '/api/questions/appeals' : '/api/questions/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(appealsEnabled
        ? {
            questionId,
            sessionAnswerId: null,
            attemptId: context.attemptId ?? null,
            reason: APPEAL_REASONS[data.type] ?? 'other',
            explanation: data.description,
            requestId,
          }
        : {
            questionId,
            attemptId: context.attemptId ?? null,
            report_type: data.type,
            description: data.description,
            requestId,
          }),
    })
    if (res.ok) return { ok: true }
    if (res.status === 401) return { ok: false, error: 'Rapor göndermek için giriş yapmalısın.' }
    if (res.status === 429) return { ok: false, error: 'Çok fazla rapor. Biraz sonra tekrar dene.' }
    return { ok: false, error: 'Rapor gönderilemedi. Tekrar dene.' }
  } catch (err) {
    console.error('[submitQuestionReport] rapor gonderilemedi:', err)
    return { ok: false, error: 'Bağlantı hatası. Tekrar dene.' }
  }
}
