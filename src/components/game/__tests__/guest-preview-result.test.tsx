/**
 * Bilge Arena: misafir önizleme sonucu — huni event'leri.
 * Misafir ResultScreen'e ulaşmadığı için GuestQuizComplete ve kayıt CTA
 * event'leri yalnız bu ekrandan gelir.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { MouseEvent, ReactNode } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

const quiz = vi.hoisted(() => ({
  value: { answers: [{ isCorrect: true }] } as { answers: { isCorrect: boolean }[] },
}))
vi.mock('@/stores/quiz-store', () => ({
  useQuizStore: (selector: (state: typeof quiz.value) => unknown) => selector(quiz.value),
}))
vi.mock('@/lib/utils/plausible', () => ({ trackEvent: vi.fn() }))
vi.mock('next/link', () => ({
  default: ({ href, onClick, children, ...rest }: {
    href: string
    onClick?: () => void
    children: ReactNode
  }) => (
    <a
      href={href}
      onClick={(event: MouseEvent) => {
        onClick?.()
        event.preventDefault()
      }}
      {...rest}
    >
      {children}
    </a>
  ),
}))

import { trackEvent } from '@/lib/utils/plausible'
import { GuestPreviewResult } from '../guest-preview-result'

beforeEach(() => {
  vi.clearAllMocks()
  quiz.value = { answers: [{ isCorrect: true }] }
})

describe('GuestPreviewResult', () => {
  test('ekran açılınca GuestQuizComplete tek kez gider', () => {
    const { rerender } = render(<GuestPreviewResult game="matematik" onRestart={vi.fn()} />)
    rerender(<GuestPreviewResult game="matematik" onRestart={vi.fn()} />)

    expect(trackEvent).toHaveBeenCalledOnce()
    expect(trackEvent).toHaveBeenCalledWith('GuestQuizComplete', {
      props: { game: 'matematik', mode: 'preview', correct: 1, total: 1 },
    })
  })

  test('yanlış cevapta doğru sayısı 0 gider', () => {
    quiz.value = { answers: [{ isCorrect: false }] }
    render(<GuestPreviewResult game="matematik" onRestart={vi.fn()} />)

    expect(trackEvent).toHaveBeenCalledWith('GuestQuizComplete', {
      props: { game: 'matematik', mode: 'preview', correct: 0, total: 1 },
    })
  })

  test('kayıt ve giriş tıklamaları ayrı outcome ile ölçülür, hedef oyuna döner', () => {
    render(<GuestPreviewResult game="matematik" onRestart={vi.fn()} />)

    const signup = screen.getByRole('link', { name: 'Ücretsiz Kayıt Ol' })
    const login = screen.getByRole('link', { name: 'Giriş yap' })
    expect(signup.getAttribute('href')).toBe('/giris?redirect=%2Farena%2Fmatematik')
    expect(login.getAttribute('href')).toBe('/giris?redirect=%2Farena%2Fmatematik')

    fireEvent.click(signup)
    fireEvent.click(login)

    expect(trackEvent).toHaveBeenCalledWith('PromptCtaClicked', {
      props: { level: 'preview', outcome: 'signup' },
    })
    expect(trackEvent).toHaveBeenCalledWith('PromptCtaClicked', {
      props: { level: 'preview', outcome: 'login' },
    })
  })

  test('Tekrar Dene: PromptDismissed(retry) + turu yeniden başlatır', () => {
    const onRestart = vi.fn()
    render(<GuestPreviewResult game="matematik" onRestart={onRestart} />)

    fireEvent.click(screen.getByRole('button', { name: 'Tekrar Dene' }))

    expect(trackEvent).toHaveBeenCalledWith('PromptDismissed', {
      props: { level: 'preview', method: 'retry' },
    })
    expect(onRestart).toHaveBeenCalledOnce()
  })
})
