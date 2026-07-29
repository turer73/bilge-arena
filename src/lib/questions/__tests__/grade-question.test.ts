import { beforeEach, describe, expect, test, vi } from 'vitest'
import { gradeQuestion } from '../grade-question'

describe('gradeQuestion', () => {
  beforeEach(() => vi.restoreAllMocks())

  test('seçimi kanonik indeksle gönderir ve doğrulanmış sonucu döndürür', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      isCorrect: false,
      correctOption: 3,
      solution: 'Çözüm',
    }), { status: 200 }))

    await expect(gradeQuestion('q-1', 2)).resolves.toEqual({
      isCorrect: false,
      correctOption: 3,
      solution: 'Çözüm',
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/questions/grade', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ questionId: 'q-1', selectedOption: 2 }),
    }))
  })

  test('HTTP hatasını ve bozuk yanıtı reddeder', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 429 }))
    await expect(gradeQuestion('q-1', 2)).rejects.toThrow('grade_failed')

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({
      isCorrect: true,
      correctOption: 9,
      solution: null,
    }), { status: 200 }))
    await expect(gradeQuestion('q-1', 2)).rejects.toThrow('invalid_grade_response')
  })
})
