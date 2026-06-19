// Soru hata-raporu gönderimi (client helper). quiz-engine inline onSubmit'ten
// çıkarıldı (test-edilebilir + tek-sorumluluk). #379 + Codex PR#242 P1: çağıran
// sonucu AWAIT eder; {ok:false} dönerse modal HATA gösterir (sahte başarı yok).

export type ReportSubmitResult = { ok: true } | { ok: false; error: string }

export async function submitQuestionReport(
  questionId: string,
  data: { type: string; description: string },
): Promise<ReportSubmitResult> {
  try {
    const res = await fetch('/api/questions/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questionId,
        report_type: data.type,
        description: data.description,
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
