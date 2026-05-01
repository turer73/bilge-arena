/**
 * Bilge Arena Oda: LobbyPreviewQuestion component tests
 * Sprint 2A Task 2
 *
 * 5 senaryo:
 *   1) initial soru render edilir (question + 4 secenek + Yeni Soru button)
 *   2) initialQuestion=null -> "Henuz uygun soru yok" mesaji
 *   3) anti-cheat: aria-label "Aklında tut sorusu", cevap gizli
 *   4) Yeni Soru butonu form action + category hidden input
 *   5) isPending=true -> button "Yükleniyor…" + disabled
 */

import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const { mockUseActionState } = vi.hoisted(() => ({
  mockUseActionState: vi.fn(),
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useActionState: mockUseActionState,
  }
})

vi.mock('@/lib/rooms/actions', () => ({
  refreshLobbyPreviewAction: vi.fn(),
}))

import { LobbyPreviewQuestion } from '../LobbyPreviewQuestion'

const formAction = vi.fn()
const sampleQuestion = {
  question: 'Türkiye’nin başkenti neresidir?',
  options: ['İstanbul', 'Ankara', 'İzmir', 'Bursa'],
}

describe('LobbyPreviewQuestion', () => {
  test('1) initial soru render: question + 4 secenek + Yeni Soru button', () => {
    mockUseActionState.mockReturnValue([
      { question: sampleQuestion },
      formAction,
      false,
    ])
    render(
      <LobbyPreviewQuestion
        initialQuestion={sampleQuestion}
        category="cografya"
      />,
    )
    expect(screen.getByText('Türkiye’nin başkenti neresidir?')).toBeInTheDocument()
    expect(screen.getByText('İstanbul')).toBeInTheDocument()
    expect(screen.getByText('Ankara')).toBeInTheDocument()
    expect(screen.getByText('İzmir')).toBeInTheDocument()
    expect(screen.getByText('Bursa')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Yeni Soru/i }),
    ).toBeInTheDocument()
  })

  test('2) initialQuestion=null -> "Henüz uygun soru yok" mesaji', () => {
    mockUseActionState.mockReturnValue([{ question: null }, formAction, false])
    render(<LobbyPreviewQuestion initialQuestion={null} category="xx_unknown" />)
    expect(screen.getByText(/Henüz uygun soru yok/i)).toBeInTheDocument()
  })

  test('3) Anti-cheat: aria-label "Aklında tut sorusu", correct_answer property gosterilmez', () => {
    mockUseActionState.mockReturnValue([
      { question: sampleQuestion },
      formAction,
      false,
    ])
    const { container } = render(
      <LobbyPreviewQuestion
        initialQuestion={sampleQuestion}
        category="cografya"
      />,
    )
    expect(
      container.querySelector('[aria-label="Aklında tut sorusu"]'),
    ).not.toBeNull()
    // "Beyin Isınma" badge gozukur (anti-cheat: cevap soruya bagli degil)
    expect(screen.getByText(/Beyin Isınma/i)).toBeInTheDocument()
    // "Cevap gizli" disclaimer mesaji
    expect(screen.getByText(/cevap gizli/i)).toBeInTheDocument()
  })

  test('4) form action + category hidden input', () => {
    mockUseActionState.mockReturnValue([
      { question: sampleQuestion },
      formAction,
      false,
    ])
    const { container } = render(
      <LobbyPreviewQuestion
        initialQuestion={sampleQuestion}
        category="matematik"
      />,
    )
    const hidden = container.querySelector(
      'input[name="category"]',
    ) as HTMLInputElement
    expect(hidden).not.toBeNull()
    expect(hidden.value).toBe('matematik')
  })

  test('5) isPending=true -> "Yükleniyor…" disabled button', () => {
    mockUseActionState.mockReturnValue([
      { question: sampleQuestion },
      formAction,
      true,
    ])
    render(
      <LobbyPreviewQuestion
        initialQuestion={sampleQuestion}
        category="cografya"
      />,
    )
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(btn.textContent).toMatch(/Yükleniyor/i)
  })
})
