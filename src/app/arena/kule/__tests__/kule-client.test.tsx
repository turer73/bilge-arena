import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { KuleClient } from '../kule-client'

const grader = vi.hoisted(() => ({ gradeQuestion: vi.fn() }))
vi.mock('@/lib/questions/grade-question', () => ({ gradeQuestion: grader.gradeQuestion }))

const ATTEMPT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const QUESTION = {
  id: 'kule-question-1',
  game: 'matematik',
  category: 'sayilar',
  content: {
    type: 'multiple_choice',
    question: '2 + 2 kaç eder?',
    options: ['4', '3', '5', '6'],
  },
}

function mockQuestionFetch() {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({
      questions: [QUESTION],
      attemptId: ATTEMPT_ID,
      expiresAt: '2099-01-01T00:00:00.000Z',
    }),
  })))
}

async function startGame() {
  render(<KuleClient />)
  const game = await screen.findByText('Matematik')
  fireEvent.click(game.closest('button')!)
  await screen.findByText(QUESTION.content.question)
}

describe('KuleClient grading', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    mockQuestionFetch()
    grader.gradeQuestion.mockResolvedValue({
      isCorrect: true,
      correctOption: 0,
      solution: 'Sunucu çözümü',
    })
  })

  it('grades the canonical option once and uses the server result for feedback', async () => {
    await startGame()

    const option = screen.getByText('4').closest('button')!
    fireEvent.click(option)
    fireEvent.click(option)

    expect(await screen.findByText(/10 puan/)).toBeInTheDocument()
    expect(screen.getByText(/Sunucu çözümü/)).toBeInTheDocument()
    expect(grader.gradeQuestion).toHaveBeenCalledTimes(1)
    expect(grader.gradeQuestion).toHaveBeenCalledWith('kule-question-1', 0, ATTEMPT_ID)
  })

  it('shows a retryable error instead of fabricating a grading result', async () => {
    grader.gradeQuestion.mockRejectedValueOnce(new Error('network'))
    await startGame()

    const option = screen.getByText('4').closest('button')!
    fireEvent.click(option)

    expect(await screen.findByText(/Cevap kontrol edilemedi/)).toBeInTheDocument()
    expect(screen.queryByText(/10 puan/)).not.toBeInTheDocument()

    grader.gradeQuestion.mockResolvedValueOnce({
      isCorrect: true,
      correctOption: 0,
      solution: null,
    })
    fireEvent.click(option)

    expect(await screen.findByText(/10 puan/)).toBeInTheDocument()
    expect(grader.gradeQuestion).toHaveBeenCalledTimes(2)
  })

  it('TYT Sosyal için exact exam kapsamı taşır ve policy seçimine yönlendirir', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: 'policy required' }),
    })))
    render(<KuleClient />)

    fireEvent.click((await screen.findByText('Sosyal Bilimler')).closest('button')!)

    expect(await screen.findByText(/Önce Çalış sayfasında TYT Sosyal/)).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('examRef=TYT'),
      { cache: 'no-store' },
    )
    expect(screen.getByRole('link', { name: 'Çalış sayfasına git' })).toHaveAttribute(
      'href',
      '/arena/calisma',
    )
  })
})
