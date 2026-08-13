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

function renderPanel(over: Partial<Parameters<typeof ExplanationPanel>[0]> = {}) {
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
  )
  return { ...utils, onNext }
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

describe('ExplanationPanel', () => {
  test('doğru cevap: mesaj + çözüm + Sonraki Soru', () => {
    const { onNext } = renderPanel()
    expect(screen.getByText(/✓ Doğru! Mükemmel/)).toBeInTheDocument()
    expect(screen.getByText(/Çözüm açıklaması\./)).toBeInTheDocument()
    const next = screen.getByRole('button', { name: 'Sonraki Soru →' })
    fireEvent.click(next)
    expect(onNext).toHaveBeenCalledOnce()
  })

  test('yanlış cevap: doğru şık harfi ve metni gösterilir', () => {
    renderPanel({ isCorrect: false, selectedOption: 0 })
    expect(screen.getByText(/✗ Yanlış\. Doğru: C\) c/)).toBeInTheDocument()
  })

  test('son soruda buton "Sonucu Gor"', () => {
    renderPanel({ isLastQuestion: true })
    expect(screen.getByRole('button', { name: 'Sonucu Gor →' })).toBeInTheDocument()
  })

  test('mount: panel kendini görünür kaydırır (scrollIntoView)', () => {
    renderPanel()
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'nearest',
    })
  })

  test('scrollIntoView yoksa (eski tarayıcı/jsdom) crash etmez', () => {
    // @ts-expect-error - runtime guard testi
    delete Element.prototype.scrollIntoView
    expect(() => renderPanel()).not.toThrow()
  })

  test('"Konu Anlatımı": passage dahil ayrıntılı DeepSeek isteği Bilge Tahta penceresini açar', async () => {
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
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({
        body: expect.stringContaining('I. Bir.'),
      }),
    )
    const sent = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)
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
