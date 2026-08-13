import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
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

const trackLearningEvent = vi.hoisted(() => vi.fn())
vi.mock('@/lib/analytics/learning-events', () => ({ trackLearningEvent }))
const trackBilgeBoardEvent = vi.hoisted(() => vi.fn())
vi.mock('@/lib/bilge-tahta/analytics', () => ({ trackBilgeBoardEvent }))

import { BilgeChanCompanion as BilgeChanCompanionImpl } from '../bilge-chan-companion'

const ATTEMPT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const SESSION_ID = '11111111-2222-4333-8444-555555555555'
const TRANSFER_ID = '99999999-8888-4777-8666-555555555555'
const TYPE_MS = 5000
const oldCoachUiEnabled = process.env.NEXT_PUBLIC_COACH_ENABLED
const oldBoardUiEnabled = process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED

function BilgeChanCompanion(props: ComponentProps<typeof BilgeChanCompanionImpl>) {
  return <BilgeChanCompanionImpl attemptId={ATTEMPT_ID} {...props} />
}

function makeQuestion(over: Partial<Question> = {}): Question {
  return {
    id: 'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb',
    game: 'matematik',
    category: 'problemler',
    subcategory: null,
    topic: null,
    difficulty: 2,
    level_tag: null,
    base_points: 20,
    content: {
      question: 'Soru metni?',
      options: ['a', 'b', 'c', 'd'],
      answer: 2,
      solution: 'Çözüm metni burada.',
    },
    ...over,
  } as Question
}

const transferQuestion = {
  id: TRANSFER_ID,
  game: 'matematik',
  category: 'problemler',
  subcategory: null,
  topic: null,
  difficulty: 2,
  level_tag: null,
  base_points: 20,
  content: { question: 'Transfer sorusu?', options: ['10', '11', '12', '13'] },
}

function pose(): string | null {
  return screen.getByTestId('chan-pose').getAttribute('data-pose')
}

const fetchMock = vi.fn()

function successfulCoachResponse(stage: string) {
  const common = {
    sessionId: SESSION_ID,
    sourceLabel: stage === 'solution' ? 'Onaylı soru çözümü' : 'Küratörlü Koç içeriği',
    evaluation: { passed: true, policyVersion: 'coach-r2.2-v1' },
  }
  if (stage === 'transfer') {
    return {
      ...common,
      stage,
      isCorrect: true,
      correctOption: 1,
      solution: 'Transfer çözümü.',
      source: 'approved_transfer',
      sourceLabel: 'Onaylı soru bankası',
      nextToken: null,
    }
  }
  if (stage === 'solution') {
    return {
      ...common,
      stage,
      hint: 'Çözüm metni burada.',
      source: 'solution',
      transferQuestion,
      nextToken: 'transfer-token',
    }
  }
  const hints: Record<string, string> = {
    hint1: 'Olası yanılgı: işlem sırası. İlk ipucu: verilenleri ayır.',
    hint2: 'İkinci ipucu',
    hint3: 'Küçük örnek çözümü',
  }
  const tokens: Record<string, string> = {
    hint1: 'hint2-token',
    hint2: 'hint3-token',
    hint3: 'solution-token',
  }
  return {
    ...common,
    stage,
    hint: hints[stage],
    source: 'authored',
    nextToken: tokens[stage],
  }
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_COACH_ENABLED = 'true'
  process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED = 'true'
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0)
  let requestCounter = 0
  vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
    requestCounter += 1
    return `10000000-0000-4000-8000-${String(requestCounter).padStart(12, '0')}`
  })
  fetchMock.mockReset()
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { stage: string }
    return new Response(JSON.stringify(successfulCoachResponse(body.stage)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  trackLearningEvent.mockClear()
  trackBilgeBoardEvent.mockClear()
  tts.speak.mockClear()
  tts.stop.mockClear()
})

afterEach(() => {
  if (oldCoachUiEnabled === undefined) delete process.env.NEXT_PUBLIC_COACH_ENABLED
  else process.env.NEXT_PUBLIC_COACH_ENABLED = oldCoachUiEnabled
  if (oldBoardUiEnabled === undefined) delete process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED
  else process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED = oldBoardUiEnabled
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('BilgeChanCompanion R2.2', () => {
  test('question=null iken render edilmez', () => {
    const { container } = render(
      <BilgeChanCompanion quizState="playing" lastIsCorrect={null} question={null} />,
    )
    expect(container.firstChild).toBeNull()
  })

  test('normal ve kolay soruda doğru başlangıç pozu kullanılır', () => {
    const { rerender } = render(
      <BilgeChanCompanion quizState="playing" lastIsCorrect={null} question={makeQuestion()} />,
    )
    expect(pose()).toBe('wave')
    rerender(
      <BilgeChanCompanion quizState="playing" lastIsCorrect={null} question={makeQuestion({ difficulty: 1 })} />,
    )
    expect(pose()).toBe('angry')
  })

  test('public kill switch kapalıysa yardım teklifi göstermez', () => {
    process.env.NEXT_PUBLIC_COACH_ENABLED = 'false'
    render(
      <BilgeChanCompanion quizState="playing" lastIsCorrect={null} question={makeQuestion()} />,
    )
    act(() => vi.advanceTimersByTime(6000))
    expect(screen.queryByRole('button', { name: 'Evet' })).not.toBeInTheDocument()
  })

  test('6 saniye sonra yardım teklifi görünür; completed durumda görünmez', () => {
    const { rerender } = render(
      <BilgeChanCompanion quizState="playing" lastIsCorrect={null} question={makeQuestion()} />,
    )
    act(() => vi.advanceTimersByTime(6000))
    expect(screen.getByRole('button', { name: 'Evet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hayır' })).toBeInTheDocument()
    rerender(
      <BilgeChanCompanion quizState="completed" lastIsCorrect={null} question={makeQuestion()} />,
    )
    expect(screen.queryByRole('button', { name: 'Evet' })).not.toBeInTheDocument()
  })

  test('ilk deneme → yanılgı/ipucu → küçük örnek → çözüm → ölçülen transfer akışını tamamlar', async () => {
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
    expect(onHelpToggle).toHaveBeenCalledWith(true)
    expect(screen.getByRole('group', { name: 'Koç öncesi ilk denemeni seç' })).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'İlk deneme A: a' }))
    await flushPromises()
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.getByText(/Olası yanılgı/)).toBeInTheDocument()
    expect(screen.getByText(/Kaynak: Küratörlü Koç içeriği/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'İkinci ipucunu al' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'İkinci ipucunu al' }))
    await flushPromises()
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.getByText('İkinci ipucu')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Küçük örneği gör' }))
    await flushPromises()
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.getByText('Küçük örnek çözümü')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Çözümü göster' }))
    await flushPromises()
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.getByText('Çözüm metni burada.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Transfer sorusuna geç' }))
    expect(screen.getByRole('group', { name: 'Transfer sorusu?' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /B.*11/ }))
    await flushPromises()
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.getByText(/Transfer sorusu doğru/)).toBeInTheDocument()
    expect(screen.getByText(/Kaynak: Onaylı soru bankası/)).toBeInTheDocument()
    expect(trackLearningEvent).toHaveBeenCalledWith('CoachTransferResult', {
      game: 'matematik',
      result: 'correct',
      coachDepth: 4,
      timing: 'same_session',
    })

    expect(fetchMock).toHaveBeenCalledTimes(5)
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)))
    expect(bodies.map((body) => body.stage)).toEqual(['hint1', 'hint2', 'hint3', 'solution', 'transfer'])
    expect(bodies[0]).toMatchObject({ selectedOption: 0, attemptId: ATTEMPT_ID })
    expect(bodies[4]).toMatchObject({ selectedOption: 1, token: 'transfer-token' })
    expect(new Set(bodies.map((body) => body.requestId)).size).toBe(5)

    fireEvent.click(screen.getByRole('button', { name: /Soruyu çözmeye dön/ }))
    expect(onHelpToggle).toHaveBeenLastCalledWith(false)
  })

  test('hata sonrası aynı idempotency requestId ile yeniden dener', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 503 }))
    render(<BilgeChanCompanion quizState="playing" lastIsCorrect={null} question={makeQuestion()} />)
    act(() => vi.advanceTimersByTime(6000))
    fireEvent.click(screen.getByRole('button', { name: 'Evet' }))
    fireEvent.click(screen.getByRole('button', { name: 'İlk deneme A: a' }))
    await flushPromises()
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.getByText(/aynı isteği güvenle yeniden deneyebilirsin/i)).toBeInTheDocument()
    const firstId = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).requestId

    fireEvent.click(screen.getByRole('button', { name: 'Aynı aşamayı yeniden dene' }))
    await flushPromises()
    const secondId = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).requestId
    expect(secondId).toBe(firstId)
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.getByText(/Olası yanılgı/)).toBeInTheDocument()
  })

  test('yalnız sunucudan açılmış Koç aşamasını Bilge Tahta dialogunda gösterir', async () => {
    const onHelpToggle = vi.fn()
    render(
      <BilgeChanCompanion
        quizState="playing"
        lastIsCorrect={null}
        question={makeQuestion({ topic: 'Dört İşlem Problemleri' })}
        onHelpToggle={onHelpToggle}
      />,
    )
    act(() => vi.advanceTimersByTime(6000))
    fireEvent.click(screen.getByRole('button', { name: 'Evet' }))
    fireEvent.click(screen.getByRole('button', { name: 'İlk deneme A: a' }))
    await flushPromises()
    act(() => vi.advanceTimersByTime(TYPE_MS))

    fireEvent.click(screen.getByRole('button', { name: /Tahtada anlat/ }))
    const dialog = screen.getByRole('dialog', { name: 'Dört İşlem Problemleri' })
    expect(dialog).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(within(dialog).getByTestId('bilge-tahta-text')).toHaveTextContent(/Olası yanılgı/)
    expect(within(dialog).getByText(/Kaynak: Küratörlü Koç içeriği/)).toBeInTheDocument()
    expect(within(dialog).getByText('Koruyucu kontrol geçti')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).not.toHaveProperty('correctOption')
    expect(trackBilgeBoardEvent).toHaveBeenCalledWith('BilgeBoardOpened', {
      surface: 'game', game: 'matematik', entryPoint: 'coach_stage',
    })
    expect(trackBilgeBoardEvent).toHaveBeenCalledWith('BilgeBoardStageViewed', {
      surface: 'game', game: 'matematik', stage: 'hint1', stepIndex: 0,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Soruyu çözmeye dön' }))
    expect(onHelpToggle).toHaveBeenLastCalledWith(false)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trackBilgeBoardEvent).toHaveBeenCalledWith('BilgeBoardReturnedToQuestion', expect.objectContaining({
      surface: 'game', game: 'matematik',
    }))
  })

  test('Bilge Tahta kill switch kapalıysa açma eylemi gösterilmez', async () => {
    process.env.NEXT_PUBLIC_BILGE_TAHTA_ENABLED = 'false'
    render(<BilgeChanCompanion quizState="playing" lastIsCorrect={null} question={makeQuestion()} />)
    act(() => vi.advanceTimersByTime(6000))
    fireEvent.click(screen.getByRole('button', { name: 'Evet' }))
    fireEvent.click(screen.getByRole('button', { name: 'İlk deneme A: a' }))
    await flushPromises()
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.queryByRole('button', { name: /Tahtada anlat/ })).not.toBeInTheDocument()
  })

  test('loading sırasında soruya dönülürse geç kalan yanıt fazı geri getirmez', async () => {
    let resolveLate: ((response: Response) => void) | undefined
    fetchMock.mockImplementationOnce((_url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      resolveLate = resolve
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    }))
    render(<BilgeChanCompanion quizState="playing" lastIsCorrect={null} question={makeQuestion()} />)
    act(() => vi.advanceTimersByTime(6000))
    fireEvent.click(screen.getByRole('button', { name: 'Evet' }))
    fireEvent.click(screen.getByRole('button', { name: 'İlk deneme A: a' }))
    expect(screen.getByRole('button', { name: /Soruyu çözmeye dön/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Soruyu çözmeye dön/ }))

    resolveLate?.(new Response(JSON.stringify(successfulCoachResponse('hint1')), { status: 200 }))
    await flushPromises()
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.getByText(CHAN_LINES.check)).toBeInTheDocument()
    expect(screen.queryByText(/Olası yanılgı/)).not.toBeInTheDocument()
  })

  test('Hayır seçimi yardım zincirini başlatmaz', () => {
    render(<BilgeChanCompanion quizState="playing" lastIsCorrect={null} question={makeQuestion()} />)
    act(() => vi.advanceTimersByTime(6000))
    fireEvent.click(screen.getByRole('button', { name: 'Hayır' }))
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.getByText(CHAN_LINES.encourage[0])).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('cevap sonrası doğru ve yanlış reaksiyonlarını korur', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.34)
    const { rerender } = render(
      <BilgeChanCompanion quizState="answered" lastIsCorrect question={makeQuestion()} correctOption={2} />,
    )
    expect(pose()).toBe('victory')
    act(() => vi.advanceTimersByTime(TYPE_MS))
    expect(screen.getByText('Harika, C doğru!')).toBeInTheDocument()
    rerender(
      <BilgeChanCompanion quizState="answered" lastIsCorrect={false} question={makeQuestion()} correctOption={2} />,
    )
    expect(pose()).toBe('sad')
  })

  test('legacy soru şekli Koç teklifi göstermez', () => {
    render(
      <BilgeChanCompanion
        quizState="playing"
        lastIsCorrect={null}
        question={makeQuestion({
          content: { sentence: 'Boşluğu doldur', options: ['a', 'b'], answer: 0 } as Question['content'],
        })}
      />,
    )
    act(() => vi.advanceTimersByTime(6000))
    expect(screen.queryByRole('button', { name: 'Evet' })).not.toBeInTheDocument()
  })

  test('TTS, priority, compact ve reduced-motion sözleşmeleri korunur', () => {
    const { container } = render(
      <BilgeChanCompanion
        quizState="playing"
        lastIsCorrect={null}
        question={makeQuestion()}
        compact
        priority
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Repliği sesli oku' }))
    expect(tts.speak).toHaveBeenCalledWith(CHAN_LINES.greet[0])
    const chan = screen.getByTestId('chan-pose')
    expect(chan.getAttribute('data-priority')).toBe('true')
    expect(chan.className).toContain('motion-reduce:animate-none')
    const root = container.firstChild as HTMLElement
    expect(root.className).toContain('flex-row')
    expect((root.querySelector('div.relative') as HTMLElement).className).toContain('max-w-[220px]')
  })

  test('TTS desteklenmiyorsa buton yoktur ve unmount konuşmayı keser', () => {
    tts.supported = false
    const { unmount } = render(
      <BilgeChanCompanion quizState="playing" lastIsCorrect={null} question={makeQuestion()} />,
    )
    expect(screen.queryByRole('button', { name: 'Repliği sesli oku' })).not.toBeInTheDocument()
    unmount()
    expect(tts.stop).toHaveBeenCalled()
    tts.supported = true
  })
})

describe('pickLine', () => {
  test('random=0 ilk, random yaklaşık 1 son elemanı seçer', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    expect(pickLine(CHAN_LINES.greet)).toBe(CHAN_LINES.greet[0])
    vi.spyOn(Math, 'random').mockReturnValue(0.999)
    expect(pickLine(CHAN_LINES.greet)).toBe(CHAN_LINES.greet[2])
  })
})
