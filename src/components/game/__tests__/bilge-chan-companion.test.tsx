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
  BilgeChan: ({ pose, priority, className }: { pose: string; priority?: boolean; className?: string }) => (
    <div data-testid="chan-pose" data-pose={pose} data-priority={String(priority ?? false)} className={className} />
  ),
}))

const tts = vi.hoisted(() => ({ supported: true, speak: vi.fn(), stop: vi.fn() }))
vi.mock('@/lib/utils/chan-tts', () => ({
  isTtsSupported: () => tts.supported,
  speakChanLine: tts.speak,
  stopChanSpeech: tts.stop,
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

const fetchMock = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0)
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { stage: string }
    const hints: Record<string, string> = {
      hint1: 'İlk ipucu',
      hint2: 'İkinci ipucu',
      hint3: 'Üçüncü ipucu',
      solution: 'Çözüm metni burada.',
    }
    return new Response(JSON.stringify({ stage: body.stage, hint: hints[body.stage] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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

  test('Evet -> 3 kademeli ipucu -> çözüm; her aşama server endpointinden gelir', async () => {
    const onHelpToggle = vi.fn()
    render(
      <BilgeChanCompanion
        quizState="playing"
        lastIsCorrect={null}
        question={makeQuestion()}
        onHelpToggle={onHelpToggle}
      />,
    )
    act(() => vi.advanceTimersByTime(6000))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Evet' }))
      await Promise.resolve()
    })
    expect(pose()).toBe('reading')
    expect(onHelpToggle).toHaveBeenCalledWith(true) // sayaç dursun
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.getByText('İlk ipucu')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Evet' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bir ipucu daha' })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bir ipucu daha' }))
      await Promise.resolve()
    })
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.getByText('İkinci ipucu')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bir ipucu daha' }))
      await Promise.resolve()
    })
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.getByText('Üçüncü ipucu')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Çözümü göster' })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Çözümü göster' }))
      await Promise.resolve()
    })
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.getByText('Çözüm metni burada.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Çözümü göster' })).not.toBeInTheDocument()

    // OTO-geçiş yok; öğrenci kendisi soruya döner.
    act(() => vi.advanceTimersByTime(8000))
    expect(pose()).toBe('reading')
    expect(screen.queryByText(CHAN_LINES.check)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Soruyu çözmeye dön/ }))
    expect(onHelpToggle).toHaveBeenCalledWith(false)
    expect(pose()).toBe('idle')
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.getByText(CHAN_LINES.check)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ questionId: 'q1', stage: 'hint1' })
  })

  test('endpoint hatasında güvenli hata mesajı ve soruya dönüş sunar', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }))
    render(<BilgeChanCompanion quizState="playing" lastIsCorrect={null} question={makeQuestion()} />)
    act(() => vi.advanceTimersByTime(6000))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Evet' }))
      await Promise.resolve()
    })
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.getByText(/Şu an ipucu alınamadı/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Soruyu çözmeye dön/ })).toBeInTheDocument()
  })

  test('endpoint beklerken öğrenci loading ekranından soruya dönebilir', async () => {
    fetchMock.mockImplementationOnce((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    const onHelpToggle = vi.fn()
    render(
      <BilgeChanCompanion
        quizState="playing"
        lastIsCorrect={null}
        question={makeQuestion()}
        onHelpToggle={onHelpToggle}
      />,
    )
    act(() => vi.advanceTimersByTime(6000))
    fireEvent.click(screen.getByRole('button', { name: 'Evet' }))
    expect(screen.getByRole('button', { name: /Soruyu çözmeye dön/ })).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Soruyu çözmeye dön/ }))
      await Promise.resolve()
    })
    expect(onHelpToggle).toHaveBeenLastCalledWith(false)
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.getByText(CHAN_LINES.check)).toBeInTheDocument()
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

  test('priority varsayılan kapalı (gizli instance preload etmesin — Codex P2), opt-in açılır', () => {
    const { rerender } = render(
      <BilgeChanCompanion quizState="playing" lastIsCorrect={null} question={makeQuestion()} />,
    )
    expect(screen.getByTestId('chan-pose').getAttribute('data-priority')).toBe('false')
    rerender(
      <BilgeChanCompanion
        quizState="playing"
        lastIsCorrect={null}
        question={makeQuestion()}
        priority
      />,
    )
    expect(screen.getByTestId('chan-pose').getAttribute('data-priority')).toBe('true')
  })

  test('TTS destekliyse balonda sesli-oku butonu; tıklayınca mevcut replik okunur', () => {
    render(
      <BilgeChanCompanion quizState="playing" lastIsCorrect={null} question={makeQuestion()} />,
    )
    const btn = screen.getByRole('button', { name: 'Repliği sesli oku' })
    fireEvent.click(btn)
    expect(tts.speak).toHaveBeenCalledWith(CHAN_LINES.greet[0])
  })

  test('TTS desteklenmiyorsa buton render edilmez', () => {
    tts.supported = false
    render(
      <BilgeChanCompanion quizState="playing" lastIsCorrect={null} question={makeQuestion()} />,
    )
    expect(screen.queryByRole('button', { name: 'Repliği sesli oku' })).not.toBeInTheDocument()
    tts.supported = true
  })

  test('idle animasyon sınıfı + reduced-motion guard uygulanır', () => {
    render(
      <BilgeChanCompanion quizState="playing" lastIsCorrect={null} question={makeQuestion()} />,
    )
    const chan = screen.getByTestId('chan-pose')
    expect(chan.className).toContain('animate-chan-idle')
    expect(chan.className).toContain('motion-reduce:animate-none')
  })

  test('unmount: yarım kalan konuşma kesilir', () => {
    const { unmount } = render(
      <BilgeChanCompanion quizState="playing" lastIsCorrect={null} question={makeQuestion()} />,
    )
    unmount()
    expect(tts.stop).toHaveBeenCalled()
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
