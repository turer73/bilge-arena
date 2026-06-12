/**
 * Bilge Arena: BilgeChanCompanion — faz akışı (intro→offered→help→check /
 * declined) + cevap reaksiyonları (victory/sad) + typewriter.
 *
 * Fake-timer notu: typewriter 26ms/harf yazar; intro mesajını okumak için
 * OFFER_DELAY'den (6000ms) KISA süre ilerletilir, yoksa faz değişir.
 * pickLine Math.random mock'u ile deterministik (0 → dizinin ilk elemanı).
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { CHAN_LINES, pickLine } from '@/lib/constants/chan-dialogue'
import type { Question } from '@/types/database'

vi.mock('@/components/ui/bilge-chan', () => ({
  BilgeChan: ({ pose }: { pose: string }) => (
    <div data-testid="chan-pose" data-pose={pose} />
  ),
}))

import { BilgeChanCompanion } from '../bilge-chan-companion'

function makeQuestion(over: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    difficulty: 2,
    content: {
      question: 'Soru metni?',
      options: ['a', 'b', 'c', 'd'],
      answer: 2, // C
      solution: 'Çözüm metni burada.',
    },
    ...over,
  } as Question
}

/** Typewriter'ın mesajı tamamen yazması için yeterli, faz timer'larından kısa süre. */
const TYPE_MS = 3000

function pose(): string | null {
  return screen.getByTestId('chan-pose').getAttribute('data-pose')
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('BilgeChanCompanion', () => {
  test('question=null -> hiç render edilmez', () => {
    const { container } = render(
      <BilgeChanCompanion quizState="playing" lastIsCorrect={null} question={null} />,
    )
    expect(container.firstChild).toBeNull()
  })

  test('intro: normal soru -> wave pose + greet repliği (typewriter tamamlanır)', () => {
    render(
      <BilgeChanCompanion quizState="playing" lastIsCorrect={null} question={makeQuestion()} />,
    )
    expect(pose()).toBe('wave')
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.getByText(CHAN_LINES.greet[0])).toBeInTheDocument()
  })

  test('intro: kolay soru (difficulty=1) -> angry pose + easyJoke repliği', () => {
    render(
      <BilgeChanCompanion
        quizState="playing"
        lastIsCorrect={null}
        question={makeQuestion({ difficulty: 1 } as Partial<Question>)}
      />,
    )
    expect(pose()).toBe('angry')
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.getByText(CHAN_LINES.easyJoke[0])).toBeInTheDocument()
  })

  test('6sn sonra offered: yardım teklifi + Evet/Hayır butonları', () => {
    render(
      <BilgeChanCompanion quizState="playing" lastIsCorrect={null} question={makeQuestion()} />,
    )
    act(() => vi.advanceTimersByTime(6000))
    expect(pose()).toBe('idle')
    expect(screen.getByRole('button', { name: 'Evet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hayır' })).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.getByText(CHAN_LINES.offer)).toBeInTheDocument()
  })

  test('quizState playing değilse offered fazına geçmez (buton yok)', () => {
    render(
      <BilgeChanCompanion quizState="completed" lastIsCorrect={null} question={makeQuestion()} />,
    )
    act(() => vi.advanceTimersByTime(10000))
    expect(screen.queryByRole('button', { name: 'Evet' })).not.toBeInTheDocument()
  })

  test('Evet -> help: reading pose + explainIntro + solution; 7sn sonra check sorusu', () => {
    render(
      <BilgeChanCompanion quizState="playing" lastIsCorrect={null} question={makeQuestion()} />,
    )
    act(() => vi.advanceTimersByTime(6000))
    fireEvent.click(screen.getByRole('button', { name: 'Evet' }))
    expect(pose()).toBe('reading')
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(
      screen.getByText(`${CHAN_LINES.explainIntro} Çözüm metni burada.`),
    ).toBeInTheDocument()
    // butonlar help fazında kaybolur
    expect(screen.queryByRole('button', { name: 'Evet' })).not.toBeInTheDocument()

    // help -> check (CHECK_DELAY=7000); kalan typewriter süresi düşülmüş olabilir,
    // toplamda 7000 + yazım payı ilerlet
    act(() => vi.advanceTimersByTime(7000))
    expect(pose()).toBe('idle')
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.getByText(CHAN_LINES.check)).toBeInTheDocument()
  })

  test('Evet + solution yok -> noSolution fallback', () => {
    const q = makeQuestion()
    delete (q.content as { solution?: string }).solution
    render(<BilgeChanCompanion quizState="playing" lastIsCorrect={null} question={q} />)
    act(() => vi.advanceTimersByTime(6000))
    fireEvent.click(screen.getByRole('button', { name: 'Evet' }))
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.getByText(CHAN_LINES.noSolution)).toBeInTheDocument()
  })

  test('Hayır -> declined: idle pose + encourage repliği, check fazına geçmez', () => {
    render(
      <BilgeChanCompanion quizState="playing" lastIsCorrect={null} question={makeQuestion()} />,
    )
    act(() => vi.advanceTimersByTime(6000))
    fireEvent.click(screen.getByRole('button', { name: 'Hayır' }))
    expect(pose()).toBe('idle')
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.getByText(CHAN_LINES.encourage[0])).toBeInTheDocument()
    // declined check'e ilerlemez
    act(() => vi.advanceTimersByTime(8000))
    expect(screen.queryByText(CHAN_LINES.check)).not.toBeInTheDocument()
  })

  test('doğru cevap -> victory pose + {harf} doğru şıkla değişir', () => {
    // correct[1] = 'Harika, {harf} doğru!' (index 1 -> random=0.34)
    vi.spyOn(Math, 'random').mockReturnValue(0.34)
    render(
      <BilgeChanCompanion quizState="answered" lastIsCorrect={true} question={makeQuestion()} />,
    )
    expect(pose()).toBe('victory')
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.getByText('Harika, C doğru!')).toBeInTheDocument()
  })

  test('yanlış cevap -> sad pose + doğru şık harfi gösterilir', () => {
    // wrong[1] = 'Doğrusu {harf} idi, takılma. 💙'
    vi.spyOn(Math, 'random').mockReturnValue(0.34)
    render(
      <BilgeChanCompanion quizState="answered" lastIsCorrect={false} question={makeQuestion()} />,
    )
    expect(pose()).toBe('sad')
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.getByText('Doğrusu C idi, takılma. 💙')).toBeInTheDocument()
  })

  test('answered iken offered fazında bile butonlar gizlenir', () => {
    const { rerender } = render(
      <BilgeChanCompanion quizState="playing" lastIsCorrect={null} question={makeQuestion()} />,
    )
    act(() => vi.advanceTimersByTime(6000))
    expect(screen.getByRole('button', { name: 'Evet' })).toBeInTheDocument()
    rerender(
      <BilgeChanCompanion quizState="answered" lastIsCorrect={true} question={makeQuestion()} />,
    )
    expect(screen.queryByRole('button', { name: 'Evet' })).not.toBeInTheDocument()
    expect(pose()).toBe('victory')
  })

  test('compact: yatay yerleşim sınıfları uygulanır', () => {
    const { container } = render(
      <BilgeChanCompanion
        quizState="playing"
        lastIsCorrect={null}
        question={makeQuestion()}
        compact
      />,
    )
    const root = container.firstChild as HTMLElement
    expect(root.className).toContain('flex-row')
    act(() => vi.advanceTimersByTime(TYPE_MS))
    const bubble = root.querySelector('div.relative') as HTMLElement
    expect(bubble.className).toContain('max-w-[190px]')
    expect(bubble.className).toContain('order-2')
  })
})

describe('pickLine', () => {
  test('random=0 -> ilk eleman, random≈1 -> son eleman', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(pickLine(CHAN_LINES.greet)).toBe(CHAN_LINES.greet[0])
    vi.spyOn(Math, 'random').mockReturnValue(0.999)
    expect(pickLine(CHAN_LINES.greet)).toBe(CHAN_LINES.greet[2])
  })
})
