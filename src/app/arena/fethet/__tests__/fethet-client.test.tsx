/**
 * Fethet regresyon testleri (disc#1427 + şık-karıştırma).
 *
 * wordquest content'i `answer` değil `correct` + `question` değil `sentence` taşır.
 * Fix öncesi: İngilizce kategorilerinde soru metni boş render ediliyor ve hiçbir
 * seçim doğru sayılmıyordu (optIdx === undefined). shuffleOptions + getQuestionText
 * normalizasyonu bunu kapatır; şıklar karıştırıldığından testler sıra-bağımsız
 * (metin üzerinden) doğrular.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FethetClient } from '../fethet-client'

const WQ_QUESTIONS = [
  {
    id: 'wq-1',
    game: 'wordquest',
    category: 'vocabulary',
    content: {
      type: 'multiple_choice',
      sentence: 'The negotiations reached a ---- when neither side compromised.',
      options: ['deadlock', 'consensus', 'breakthrough', 'resolution', 'harmony'],
      correct: 0,
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
      correct: 0,
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
      correct: 0,
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
      const q = WQ_QUESTIONS[i].content
      const wrongText = q.options.find((_, idx) => idx !== q.correct)!
      const opt = await screen.findByText(wrongText)
      fireEvent.click(opt.closest('button')!)
      fireEvent.click(
        screen.getByText(i < 2 ? 'Sonraki Soru →' : 'Sonucu Gör')
      )
    }

    await waitFor(() => {
      expect(screen.getByText('Başarısız')).toBeInTheDocument()
    })
  })
})
