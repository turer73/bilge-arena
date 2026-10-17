'use client'

export interface QuestionGradeResult {
  isCorrect: boolean
  correctOption: number
  solution: string | null
  /** Sunucunun saydığı (kilitli) ilk seçim; -1 boş/süre dolumu. */
  acceptedOption?: number
}

export interface QuestionGradeStrategyEvent {
  clientEventId: string
  sequence: number
  position: number
}

/** Doğru cevabı yalnız kullanıcı seçimini gönderdikten sonra açar. */
export async function gradeQuestion(
  questionId: string,
  selectedOption: number,
  attemptId: string | null = null,
  signal?: AbortSignal,
  strategyEvent?: QuestionGradeStrategyEvent,
): Promise<QuestionGradeResult> {
  const response = await fetch('/api/questions/grade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId, selectedOption, attemptId, ...(strategyEvent ? { strategyEvent } : {}) }),
    signal,
  })

  if (!response.ok) throw new Error('grade_failed')

  const payload = await response.json() as Partial<QuestionGradeResult>
  if (
    typeof payload.isCorrect !== 'boolean'
    || !Number.isInteger(payload.correctOption)
    || (payload.correctOption as number) < 0
    || (payload.correctOption as number) > 4
    || !(payload.solution === null || typeof payload.solution === 'string')
    || !(payload.acceptedOption === undefined || (
      Number.isInteger(payload.acceptedOption)
      && (payload.acceptedOption as number) >= -1
      && (payload.acceptedOption as number) <= 4
    ))
  ) {
    throw new Error('invalid_grade_response')
  }

  return payload as QuestionGradeResult
}
