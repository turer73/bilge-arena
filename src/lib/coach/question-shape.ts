/**
 * Kademeli Bilge Koç ilk dilimde yalnız standart çoktan seçmeli soru JSON'unu
 * destekler. Legacy WordQuest/cloze şekilleri için endpoint'e hiç istek
 * gönderilmez; böylece cevap sızıntısı kontrolü belirsiz bir içerik biçiminde
 * yanlış varsayım yapmaz.
 */
export interface StagedCoachQuestionContent {
  question: string
  options: string[]
  answer: number
  hint?: string
  solution?: string
}

export function supportsStagedCoachQuestion(
  content: unknown,
): content is StagedCoachQuestionContent {
  if (!content || typeof content !== 'object') return false

  const candidate = content as Record<string, unknown>
  if (typeof candidate.question !== 'string' || !candidate.question.trim()) return false
  if (!Array.isArray(candidate.options) || candidate.options.length < 2) return false
  if (!candidate.options.every((option) => typeof option === 'string' && option.trim())) return false
  if (typeof candidate.answer !== 'number' || !Number.isInteger(candidate.answer)) return false

  return candidate.answer >= 0 && candidate.answer < candidate.options.length
}
