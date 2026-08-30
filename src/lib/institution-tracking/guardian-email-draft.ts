import { z } from 'zod'
import { institutionStudentLearningAnalysisSchema } from './student-analysis'
import { institutionStudentReportScopeLabel } from './student-report'

export const guardianEmailDraftSchema = z.object({
  subject: z.string().trim().min(5).max(160),
  body: z.string().trim().min(80).max(5_000),
}).strict()

function list(values: string[], empty: string): string {
  return values.length ? values.map((value) => `- ${value}`).join('\n') : `- ${empty}`
}

export function buildGuardianStatusEmailDraft(value: unknown) {
  const parsed = institutionStudentLearningAnalysisSchema.safeParse(value)
  if (!parsed.success) return null
  const analysis = parsed.data
  const strong = analysis.outcomes.filter((item) => item.assessment.status === 'mastered').slice(0, 3).map((item) => item.title)
  const developing = analysis.outcomes.filter((item) => item.assessment.status === 'developing').slice(0, 3).map((item) => item.title)
  const insufficientCount = analysis.summary.insufficientOutcomeCount
  const scopeLabel = institutionStudentReportScopeLabel(analysis.scope)
  const body = [
    'Merhaba,',
    '',
    `${analysis.student.alias} için ${scopeLabel} çalışma durumuna ilişkin kısa bilgilendirme aşağıdadır.`,
    '',
    'Güçlü kanıt görülen kazanımlar:',
    list(strong, 'Bu dönemde henüz güçlü karar vermek için yeterli tekrarlı kanıt oluşmadı.'),
    '',
    'Gelişim odağındaki kazanımlar:',
    list(developing, 'Karar güvenli gelişim odağı henüz oluşmadı.'),
    '',
    `Kanıtı henüz yetersiz kazanım sayısı: ${insufficientCount}. Bu alanlar başarısızlık olarak değerlendirilmemiştir; ek çalışma ve durum tespiti gerektirir.`,
    '',
    `Analiz ${analysis.summary.assessedOutcomeCount} kazanımda yeterli tekrarlı kanıta dayanmaktadır. Sonuçlar öğrencinin sınıfa katılımından sonraki doğrulanmış çalışmalarını kapsar.`,
    '',
    'Bu metin otomatik gönderim değildir. Öğretmen değerlendirmesi ve gerekli kişiselleştirme tamamlandıktan sonra paylaşılmalıdır.',
    '',
    'İyi çalışmalar.',
  ].join('\n')
  const result = {
    subject: `${analysis.student.alias} – ${scopeLabel} çalışma durumu`,
    body,
  }
  const validated = guardianEmailDraftSchema.safeParse(result)
  return validated.success ? validated.data : null
}

export type GuardianEmailDraft = z.infer<typeof guardianEmailDraftSchema>
