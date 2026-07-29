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

/** Client eligibility check; public payload intentionally has no answer key. */
export function supportsStagedCoachPublicQuestion(content: unknown): boolean {
  if (!content || typeof content !== 'object') return false
  const candidate = content as Record<string, unknown>
  return typeof candidate.question === 'string'
    && Boolean(candidate.question.trim())
    && Array.isArray(candidate.options)
    && candidate.options.length >= 2
    && candidate.options.every((option) => typeof option === 'string' && Boolean(option.trim()))
}

export function supportsStagedCoachQuestion(
  content: unknown,
): content is StagedCoachQuestionContent {
  if (!supportsStagedCoachPublicQuestion(content)) return false
  const candidate = content as Record<string, unknown>
  if (typeof candidate.answer !== 'number' || !Number.isInteger(candidate.answer)) return false
  const options = candidate.options as unknown[]

  return candidate.answer >= 0 && candidate.answer < options.length
}
