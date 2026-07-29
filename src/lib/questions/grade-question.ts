'use client'

export interface QuestionGradeResult {
  isCorrect: boolean
  correctOption: number
  solution: string | null
}

/** Doğru cevabı yalnız kullanıcı seçimini gönderdikten sonra açar. */
export async function gradeQuestion(
  questionId: string,
  selectedOption: number,
  signal?: AbortSignal,
): Promise<QuestionGradeResult> {
  const response = await fetch('/api/questions/grade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId, selectedOption }),
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
  ) {
    throw new Error('invalid_grade_response')
  }

  return payload as QuestionGradeResult
}
