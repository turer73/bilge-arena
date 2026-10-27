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
    const { container } = render(
      <QuestionCard question={makeQ({})} currentIndex={0} totalQuestions={10} onReport={onReport} />,
    )
    const reportButton = screen.getByRole('button', { name: 'Soruyu raporla' })
    expect(reportButton.querySelector('svg')).toBeInTheDocument()
    expect(container.textContent).not.toContain('🐛')
    fireEvent.click(reportButton)
    expect(onReport).toHaveBeenCalledTimes(1)
  })

  test('ders emojisi yerine oyuna ait çizgi ikonunu gösterir', () => {
    const { container } = render(
      <QuestionCard question={makeQ({})} currentIndex={0} totalQuestions={10} />,
    )
    expect(container.querySelector('[data-question-subject-icon="fen"] svg')).toBeInTheDocument()
    expect(container.textContent).not.toContain('🔬')
  })

  test('onReport yoksa "Bildir" butonu render edilmez', () => {
    render(<QuestionCard question={makeQ({})} currentIndex={0} totalQuestions={10} />)
    expect(screen.queryByRole('button', { name: 'Soruyu raporla' })).not.toBeInTheDocument()
  })

  // "🦉 Sor" butonu kaldırıldı (konu#7 ders-hub planı) — soru-içi AI yardımı
  // artık Bilge Çan'a ait; Bilge Asistan yalnızca /arena/calisma hub'ında inline.
  test('"Bilge Asistan\'a sor" butonu artık render edilmez', () => {
    render(<QuestionCard question={makeQ({})} currentIndex={0} totalQuestions={10} />)
    expect(screen.queryByRole('button', { name: "Bilge Asistan'a sor" })).not.toBeInTheDocument()
  })

  test('soru kökü başlık yerine normal ağırlıkta okunur metin; bölüm adı ekran okuyucuda kalır', () => {
    const { container } = render(
      <QuestionCard question={makeQ({ passage: 'Öncül' })} currentIndex={2} totalQuestions={10} />,
    )
    expect(screen.getByRole('region', { name: 'Soru 3' })).toBeInTheDocument()
    const prompt = container.querySelector('[data-quiz-prompt]')
    expect(prompt?.tagName).toBe('P')
    expect(prompt).toHaveTextContent('Yukarıdaki ifadelerden hangileri doğrudur?')
    expect(prompt).not.toHaveClass('font-extrabold')
    expect(container.querySelector('[data-quiz-passage]')).toHaveTextContent('Öncül')
  })

  test('coachControl verilince Yardım düğmesi bölgeyi açıp kapatır', () => {
    const onToggle = vi.fn()
    const { rerender } = render(
      <QuestionCard question={makeQ({})} currentIndex={0} totalQuestions={10}
        coachControl={{ open: false, id: 'coach-region', onToggle }} />,
    )
    const help = screen.getByRole('button', { name: 'Bilge Çan yardımı' })
    expect(help).toHaveAttribute('aria-expanded', 'false')
    expect(help).toHaveAttribute('aria-controls', 'coach-region')
    fireEvent.click(help)
    expect(onToggle).toHaveBeenCalledTimes(1)
    rerender(
      <QuestionCard question={makeQ({})} currentIndex={0} totalQuestions={10}
        coachControl={{ open: true, id: 'coach-region', onToggle }} />,
    )
    expect(help).toHaveAttribute('aria-expanded', 'true')
  })
})
