/**
 * Bilge Arena: ExplanationPanel — sonuç mesajı, çözüm, Sonraki Soru
 * + mount'ta scrollIntoView (panel artık sorunun üstünde render olur).
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'
import type { Question } from '@/types/database'

vi.mock('@/components/social/like-button', () => ({ LikeButton: () => null }))
import { ExplanationPanel } from '../explanation-panel'

const QUESTION = {
  id: 'q1',
  game: 'matematik',
  category: 'problemler',
  subcategory: null,
  difficulty: 3,
  content: {
    question: 'Soru?',
    options: ['a', 'b', 'c', 'd'],
    answer: 2,
    solution: 'Çözüm açıklaması.',
  },
} as unknown as Question

function setWide(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

function renderPanel(over: Partial<Parameters<typeof ExplanationPanel>[0]> = {}, container?: HTMLElement) {
  const onNext = vi.fn()
  const utils = render(
    <ExplanationPanel
      question={QUESTION}
      selectedOption={2}
      isCorrect={true}
      correctOption={2}
      solution="Çözüm açıklaması."
      isLastQuestion={false}
      onNext={onNext}
      {...over}
    />,
    container ? { container: container.appendChild(document.createElement('div')) } : undefined,
  )
  return { ...utils, onNext }
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function(this: HTMLDialogElement) { this.setAttribute('open', '') },
  })
})

describe('ExplanationPanel', () => {
  test('doğru cevap: mesaj + çözüm + Sonraki Soru', () => {
    const { onNext } = renderPanel()
    expect(screen.getByText('Doğru! Mükemmel')).toBeInTheDocument()
    expect(screen.getByText(/Çözüm açıklaması\./)).toBeInTheDocument()
    const next = screen.getByRole('button', { name: 'Sonraki Soru' })
    fireEvent.click(next)
    expect(onNext).toHaveBeenCalledOnce()
  })

  test('yanlış cevap: doğru şık harfi ve metni gösterilir', () => {
    renderPanel({ isCorrect: false, selectedOption: 0 })
    expect(screen.getByText('Yanlış. Doğru cevap: C) c')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hata bildir' })).not.toBeInTheDocument()
  })

  test('son soruda buton "Sonucu Gor"', () => {
    renderPanel({ isLastQuestion: true })
    expect(screen.getByRole('button', { name: 'Sonucu Gör' })).toBeInTheDocument()
  })

  test('ayrıntılı çözüm penceresi soru, verilen cevap, doğru cevap ve çözümü gösterir', () => {
    renderPanel({ isCorrect: false, selectedOption: 0 })
    expect(screen.queryByRole('dialog', { name: 'Ayrıntılı çözüm' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ayrıntılı Çözüm' }))
    const dialog = screen.getByRole('dialog', { name: 'Ayrıntılı çözüm' })
    expect(dialog).toHaveAttribute('open')
    expect(dialog).toHaveAttribute('data-mobile-sheet', 'true')
    expect(dialog).toHaveTextContent('Senin cevabın')
    expect(dialog).toHaveTextContent('A) a')
    expect(dialog).toHaveTextContent('Doğru cevap')
    expect(dialog).toHaveTextContent('C) c')
    expect(dialog).toHaveTextContent('Çözümün mantığı')
    expect(dialog).toHaveTextContent('Çözüm açıklaması.')
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }))
    expect(screen.queryByRole('dialog', { name: 'Ayrıntılı çözüm' })).not.toBeInTheDocument()
  })

  test('geniş ekranda mount: panel kendini görünür kaydırır (scrollIntoView)', () => {
    setWide(true)
    renderPanel()
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'nearest',
    })
    expect(screen.getByRole('button', { name: 'Sonraki Soru' })).not.toHaveFocus()
  })

  test('mobilde alt panel: kabuğa yüksekliğini yazar, işaretli şıkkı panelin üstüne kaydırır, odağı Sonraki Soru düğmesine verir', () => {
    setWide(false)
    const scrollBy = vi.fn()
    window.scrollBy = scrollBy as unknown as typeof window.scrollBy
    const shell = document.createElement('div')
    shell.setAttribute('data-responsive-quiz-shell', '')
    const marked = document.createElement('button')
    marked.setAttribute('data-quiz-option', 'correct')
    shell.appendChild(marked)
    document.body.appendChild(shell)
    marked.getBoundingClientRect = () => ({ bottom: 600 }) as DOMRect
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
      if (this === marked) return { bottom: 600 } as DOMRect
      return { top: 400, height: 240, bottom: 640 } as DOMRect
    })
    try {
      const { unmount } = renderPanel({}, shell)
      expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
      expect(shell.style.getPropertyValue('--quiz-sheet-h')).toBe('240px')
      expect(scrollBy).toHaveBeenCalledWith({ top: 212, behavior: 'smooth' })
      expect(screen.getByRole('button', { name: 'Sonraki Soru' })).toHaveFocus()
      unmount()
      expect(shell.style.getPropertyValue('--quiz-sheet-h')).toBe('')
    } finally {
      rectSpy.mockRestore()
      shell.remove()
    }
  })

  test('scrollIntoView yoksa (eski tarayıcı/jsdom) crash etmez', () => {
    // @ts-expect-error - runtime guard testi
    delete Element.prototype.scrollIntoView
    expect(() => renderPanel()).not.toThrow()
  })

  test('karıştırılmış şık sırasını sohbet bağlamına ekler (Codex F2)', () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>(() => {}))
    global.fetch = fetchMock as unknown as typeof fetch
    renderPanel({ isCorrect: false, selectedOption: 0, optionOrder: [2, 0, 3, 1], attemptId: 'attempt-1' })
    fireEvent.click(screen.getByRole('button', { name: /Konu Anlat/ }))
    const sent = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)
    expect(sent.context).toEqual({ kind: 'question', questionId: 'q1', attemptId: 'attempt-1', shownCorrectOption: 2, optionOrder: [2, 0, 3, 1] })
  })

  test('"Konu Anlatımı": soru kimliğiyle ayrıntılı DeepSeek isteği Bilge Tahta penceresini açar', async () => {
    let resolveFetch!: (response: Response) => void
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>((resolve) => {
      resolveFetch = resolve
    }))
    global.fetch = fetchMock as unknown as typeof fetch
    const Q = {
      ...QUESTION,
      content: { ...QUESTION.content, passage: 'Öncül;\nI. Bir.\nII. İki.' },
    } as unknown as Question
    renderPanel({ question: Q, isCorrect: false, selectedOption: 0 })
    fireEvent.click(screen.getByRole('button', { name: /Konu Anlat/ }))
    expect(screen.getByRole('dialog', { name: /problemler/i })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText(/Bilge Asistan ayrıntılı anlatımı tahtaya hazırlıyor/)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/chat', expect.objectContaining({ method: 'POST' }))
    const sent = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)
    // Soru metni, öncül ve çözüm istemciden gitmez; sunucu soruyu kimliğinden okur.
    expect(sent.context).toEqual({ kind: 'question', questionId: 'q1', shownCorrectOption: 2 })
    expect(sent).not.toHaveProperty('questionContext')
    expect(JSON.stringify(sent)).not.toMatch(/I\. Bir\.|Çözüm açıklaması/)
    expect(sent.mode).toBe('topic_explanation')
    expect(sent.messages[0].content).toContain('yüzeysel özetleme')
    await act(async () => {
      resolveFetch(new Response(
        'Öğrenme hedefi\nKavramın mantığı\nAdım adım örnek',
        { status: 200 },
      ))
    })
    expect(screen.getByRole('dialog', { name: /problemler/i })).not.toHaveAttribute('aria-busy')
    expect(screen.getByText(/Adım adım örnek/)).toBeInTheDocument()
  })
})
