/**
 * QuestionCard — roman_numeral öncül (passage) render + oyun-sırası rapor butonu.
 * Ensar 06-16: passage (I/II/III öncülleri) ayrı alanda duruyordu ve render
 * edilmiyordu → soru "Yukarıdaki ifadelerden hangileri doğrudur?" deyip BOŞ
 * görünüyordu. Ayrıca denemede soruyu cevaplamadan raporlama butonu yoktu.
 */

import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Question } from '@/types/database'
import { QuestionCard } from '../question-card'

// handleAskAssistant store'a dokunur — render testleri için hafif stub
vi.mock('@/stores/chat-store', () => ({
  useChatStore: {
    getState: () => ({
      setQuestionContext: vi.fn(),
      clearMessages: vi.fn(),
      setOpen: vi.fn(),
    }),
  },
}))

const makeQ = (content: Partial<Question['content']>): Question =>
  ({
    id: 'q1',
    game: 'fen',
    category: 'fizik',
    subcategory: null,
    difficulty: 3,
    content: {
      question: 'Yukarıdaki ifadelerden hangileri doğrudur?',
      options: ['Yalnız I', 'Yalnız II', 'I ve II', 'II ve III', 'I, II ve III'],
      answer: 4,
      ...content,
    },
  }) as unknown as Question

describe('QuestionCard', () => {
  test('passage varsa öncül bloğu (I/II/III) soru kökünden önce render edilir', () => {
    const passage =
      'Kütle çekim ile ilgili;\nI. Birinci ifade.\nII. İkinci ifade.\nIII. Üçüncü ifade.'
    const { container } = render(
      <QuestionCard question={makeQ({ passage })} currentIndex={3} totalQuestions={40} />,
    )
    // whitespace-pre-line tek <p>'de \n korur → textContent ham passage'i icerir
    expect(container.textContent).toContain('I. Birinci ifade.')
    expect(container.textContent).toContain('III. Üçüncü ifade.')
    expect(screen.getByText('Yukarıdaki ifadelerden hangileri doğrudur?')).toBeInTheDocument()
  })

  test('passage yoksa yalnız soru kökü render edilir', () => {
    const { container } = render(
      <QuestionCard question={makeQ({ question: 'Sadece soru?' })} currentIndex={0} totalQuestions={10} />,
    )
    expect(screen.getByText('Sadece soru?')).toBeInTheDocument()
    expect(container.textContent).not.toContain('Birinci ifade')
  })

  test('onReport verilince "Bildir" butonu render + tıklanınca çağrılır', () => {
    const onReport = vi.fn()
    render(
      <QuestionCard question={makeQ({})} currentIndex={0} totalQuestions={10} onReport={onReport} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Soruyu raporla' }))
    expect(onReport).toHaveBeenCalledTimes(1)
  })

  test('onReport yoksa "Bildir" butonu render edilmez', () => {
    render(<QuestionCard question={makeQ({})} currentIndex={0} totalQuestions={10} />)
    expect(screen.queryByRole('button', { name: 'Soruyu raporla' })).not.toBeInTheDocument()
  })
})
