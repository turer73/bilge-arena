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
  coach?: {
    misconceptions?: string[]
    hint1?: string
    hint2?: string
    miniExample?: string
  }
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

/**
 * R2.2 kontrollü akış yalnız küratörlü çözümü bulunan sorularda açılır. İsteğe
 * bağlı coach alanı da tamamen doğrulanır; kısmi/bozuk metadata sessizce
 * kullanılmaz.
 */
export function supportsGuidedCoachQuestion(
  content: unknown,
): content is StagedCoachQuestionContent & { solution: string } {
  if (!supportsStagedCoachQuestion(content)) return false
  if (typeof content.solution !== 'string' || !content.solution.trim()) return false
  if (content.coach === undefined) return true
  if (!content.coach || typeof content.coach !== 'object') return false

  const { misconceptions, hint1, hint2, miniExample } = content.coach
  if (misconceptions !== undefined && (
    !Array.isArray(misconceptions)
    || misconceptions.length !== content.options.length
    || misconceptions.some((item) => typeof item !== 'string' || !item.trim())
  )) return false

  return [hint1, hint2, miniExample].every(
    (item) => item === undefined || (typeof item === 'string' && Boolean(item.trim())),
  )
}
