/**
 * Fethet regresyon testleri (disc#1427 + şık-karıştırma).
 *
 * Wordquest prompts use `sentence`; grading is always delegated to the server.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FethetClient } from '../fethet-client'

const grader = vi.hoisted(() => ({ gradeQuestion: vi.fn() }))
vi.mock('@/lib/questions/grade-question', () => ({ gradeQuestion: grader.gradeQuestion }))

const WQ_QUESTIONS = [
  {
    id: 'wq-1',
    game: 'wordquest',
    category: 'vocabulary',
    content: {
      type: 'multiple_choice',
      sentence: 'The negotiations reached a ---- when neither side compromised.',
      options: ['deadlock', 'consensus', 'breakthrough', 'resolution', 'harmony'],
    },
  },
  {
    id: 'wq-2',
    game: 'wordquest',
    category: 'vocabulary',
    content: {
      type: 'multiple_choice',
      sentence: 'The rapid ---- of technology transformed communication.',
      options: ['advancement', 'withdrawal', 'restriction', 'decline', 'stagnation'],
    },
  },
  {
    id: 'wq-3',
    game: 'wordquest',
    category: 'vocabulary',
    content: {
      type: 'multiple_choice',
      sentence: 'The violin is a delicate ---- requiring years of practice.',
      options: ['instrument', 'ornament', 'utensil', 'gadget', 'device'],
    },
  },
]
const CORRECT_TEXTS = ['deadlock', 'advancement', 'instrument']

function mockFetchWith(questions: unknown[]) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ questions }),
  })))
}

async function openVocabularyQuiz() {
  render(<FethetClient />)
  const catLabel = await screen.findByText('Vocabulary')
  fireEvent.click(catLabel.closest('button')!)
}

describe('FethetClient — wordquest (İngilizce) akışı', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    grader.gradeQuestion.mockImplementation(async (_questionId: string, selectedOption: number) => ({
      isCorrect: selectedOption === 0,
      correctOption: 0,
      solution: null,
    }))
  })

  it('wordquest sentence alanını soru metni olarak basar (fix öncesi boştu)', async () => {
    mockFetchWith(WQ_QUESTIONS)
    await openVocabularyQuiz()
    expect(
      await screen.findByText(/The negotiations reached a/)
    ).toBeInTheDocument()
  })

  it('correct alanlı sorularda doğru seçimler sayılır ve kategori fethedilir (disc#1427)', async () => {
    mockFetchWith(WQ_QUESTIONS)
    await openVocabularyQuiz()

    for (let i = 0; i < 3; i++) {
      // Şıklar karıştırılmış olabilir — doğru şıkkı METİNLE bul (sıra-bağımsız).
      const opt = await screen.findByText(CORRECT_TEXTS[i])
      fireEvent.click(opt.closest('button')!)
      await screen.findByText(/Sonraki|Sonucu/)
      fireEvent.click(
        screen.getByText(i < 2 ? 'Sonraki Soru →' : 'Sonucu Gör')
      )
    }

    await waitFor(() => {
      expect(screen.getByText('Fethedildi!')).toBeInTheDocument()
    })
  })

  it('yanlış seçimlerle kategori fethedilemez (notlama gerçekten ayırt ediyor)', async () => {
    mockFetchWith(WQ_QUESTIONS)
    await openVocabularyQuiz()

    for (let i = 0; i < 3; i++) {
      // Doğru-OLMAYAN ilk şıkkı metinle bul ve tıkla.
      const wrongText = WQ_QUESTIONS[i].content.options[1]!
      const opt = await screen.findByText(wrongText)
      fireEvent.click(opt.closest('button')!)
      await screen.findByText(/Sonraki|Sonucu/)
      fireEvent.click(
        screen.getByText(i < 2 ? 'Sonraki Soru →' : 'Sonucu Gör')
      )
    }

    await waitFor(() => {
      expect(screen.getByText('Başarısız')).toBeInTheDocument()
    })
  })
})
