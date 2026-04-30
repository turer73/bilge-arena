/**
 * Bilge Arena Oda: HostGameActions smoke test
 * Sprint 1 PR4e-3 + Codex P1 PR #51 fix (bootstrap advance)
 */

import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const { mockUseActionState, mockAdvance, mockReveal } = vi.hoisted(() => ({
  mockUseActionState: vi.fn(),
  mockAdvance: vi.fn(),
  mockReveal: vi.fn(),
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return { ...actual, useActionState: mockUseActionState }
})

vi.mock('@/lib/rooms/actions', () => ({
  advanceRoundAction: mockAdvance,
  revealRoundAction: mockReveal,
}))

import { HostGameActions } from '../HostGameActions'
import type { CurrentRound } from '@/lib/rooms/room-state-reducer'

const formAction = vi.fn()

const activeRound: CurrentRound = {
  round_index: 1,
  question_id: 'q1',
  started_at: '2026-04-30T00:00:00Z',
  ends_at: '2026-04-30T00:00:20Z',
  revealed_at: null,
}

describe('HostGameActions', () => {
  test('1) isHost=false -> null', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    const { container } = render(
      <HostGameActions
        isHost={false}
        roomId="r1"
        roomState="active"
        currentRound={activeRound}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  test('2) active + currentRound exists -> "Cevabı Göster"', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    render(
      <HostGameActions
        isHost={true}
        roomId="r1"
        roomState="active"
        currentRound={activeRound}
      />,
    )
    expect(
      screen.getByRole('button', { name: /Cevabı Göster/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Sonraki Tura/i }),
    ).not.toBeInTheDocument()
  })

  test('3) reveal -> "Sonraki Tura Geç"', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    render(
      <HostGameActions
        isHost={true}
        roomId="r1"
        roomState="reveal"
        currentRound={activeRound}
      />,
    )
    expect(
      screen.getByRole('button', { name: /Sonraki Tura/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Cevabı Göster/i }),
    ).not.toBeInTheDocument()
  })

  test('4) lobby -> null', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    const { container } = render(
      <HostGameActions
        isHost={true}
        roomId="r1"
        roomState="lobby"
        currentRound={null}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  test('5) Codex P1 PR#51 fix: active + currentRound=null -> "İlk Soruyu Başlat" (bootstrap advance)', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    render(
      <HostGameActions
        isHost={true}
        roomId="r1"
        roomState="active"
        currentRound={null}
      />,
    )
    expect(
      screen.getByRole('button', { name: /İlk Soruyu Başlat/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Cevabı Göster/i }),
    ).not.toBeInTheDocument()
  })
})
