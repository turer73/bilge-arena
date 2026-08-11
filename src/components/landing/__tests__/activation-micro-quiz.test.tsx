import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ActivationMicroQuiz } from '../activation-micro-quiz'
import type { PublicQuestion } from '@/lib/utils/question-public'

const mocks = vi.hoisted(() => ({
  fetchPreviewQuestions: vi.fn(),
  gradeQuestion: vi.fn(),
  signInWithGoogle: vi.fn(),
  trackEvent: vi.fn(),
  playSound: vi.fn(),
}))

vi.mock('@/lib/supabase/questions', () => ({
  fetchPreviewQuestions: (...args: unknown[]) => mocks.fetchPreviewQuestions(...args),
}))

vi.mock('@/lib/questions/grade-question', () => ({
  gradeQuestion: (...args: unknown[]) => mocks.gradeQuestion(...args),
}))

vi.mock('@/lib/hooks/use-auth', () => ({
  useAuth: () => ({
    user: null,
    profile: null,
    loading: false,
    signInWithGoogle: mocks.signInWithGoogle,
    signInWithMagicLink: vi.fn(),
    signOut: vi.fn(),
  }),
}))

vi.mock('@/lib/utils/plausible', () => ({
  trackEvent: (...args: unknown[]) => mocks.trackEvent(...args),
}))

vi.mock('@/lib/utils/sounds', () => ({
  playSound: (...args: unknown[]) => mocks.playSound(...args),
}))

function makeQuestion(index: number): PublicQuestion {
  return {
    id: `00000000-0000-4000-8000-00000000000${index}`,
    game: 'turkce',
    category: 'paragraf',
    subcategory: null,
    topic: 'Anlam',
    difficulty: 1,
    level_tag: null,
    base_points: 10,
    content: {
      question: `Deneme sorusu ${index}`,
      options: [`${index} A`, `${index} B`, `${index} C`, `${index} D`],
    },
  }
}

describe('ActivationMicroQuiz', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.documentElement.dataset.activationVariant = 'micro'
    mocks.fetchPreviewQuestions.mockResolvedValue([makeQuestion(1), makeQuestion(2), makeQuestion(3)])
    mocks.gradeQuestion.mockImplementation(async (_id: string, selectedOption: number) => ({
      isCorrect: true,
      correctOption: selectedOption,
      solution: 'Kısa çözüm.',
    }))
  })

  it('sinav hedefini ve ilk soru gorunumunu olcer', async () => {
    render(<ActivationMicroQuiz />)

    fireEvent.click(screen.getByRole('button', { name: /LGS: Ortaokul hedefim/i }))

    await screen.findByText('Deneme sorusu 1')
    expect(mocks.fetchPreviewQuestions).toHaveBeenCalledWith('turkce', {
      examRef: 'LGS',
      activation: true,
    })
    expect(mocks.trackEvent).toHaveBeenCalledWith('ActivationQuestionShown', {
      props: expect.objectContaining({ exam: 'LGS', position: 1, variant: 'micro' }),
    })
  })

  it('uc soruyu notlandirir ve durust deneme XP sonucunu gosterir', async () => {
    render(<ActivationMicroQuiz />)
    fireEvent.click(screen.getByRole('button', { name: /TYT · AYT: Üniversite hedefim/i }))

    for (let position = 1; position <= 3; position++) {
      await screen.findByText(`Deneme sorusu ${position}`)
      const option = screen.getAllByRole('button', { name: /seçeneği:/i })[0]
      fireEvent.click(option)
      await screen.findByText(/Harika! \+50 XP/i)
      fireEvent.click(screen.getByRole('button', {
        name: position === 3 ? /Sonucumu gör/i : /Sıradaki soru/i,
      }))
    }

    expect(await screen.findByText('3/3 doğru')).toBeInTheDocument()
    expect(screen.getByText('+150 XP')).toBeInTheDocument()
    expect(screen.getByText(/hesabına tek seferlik eklenecek/i)).toBeInTheDocument()
    expect(mocks.gradeQuestion).toHaveBeenCalledTimes(3)
    expect(mocks.trackEvent).toHaveBeenCalledWith('ActivationMicroSessionCompleted', {
      props: expect.objectContaining({ exam: 'TYT', correct: 3, total: 3 }),
    })
  })

  it('misafir devam CTA’sinda Google girisini baslatir', async () => {
    render(<ActivationMicroQuiz />)
    fireEvent.click(screen.getByRole('button', { name: /LGS: Ortaokul hedefim/i }))

    for (let position = 1; position <= 3; position++) {
      await screen.findByText(`Deneme sorusu ${position}`)
      fireEvent.click(screen.getAllByRole('button', { name: /seçeneği:/i })[0])
      await screen.findByText(/Harika! \+50 XP/i)
      fireEvent.click(screen.getByRole('button', {
        name: position === 3 ? /Sonucumu gör/i : /Sıradaki soru/i,
      }))
    }

    fireEvent.click(await screen.findByRole('button', { name: /Google ile ücretsiz devam et/i }))
    await waitFor(() => expect(mocks.signInWithGoogle).toHaveBeenCalledTimes(1))
    expect(mocks.signInWithGoogle).toHaveBeenCalledWith('/arena/turkce')
    expect(mocks.trackEvent).toHaveBeenCalledWith('ActivationSaveStarted', {
      props: expect.objectContaining({ exam: 'LGS', variant: 'micro' }),
    })
  })
})
