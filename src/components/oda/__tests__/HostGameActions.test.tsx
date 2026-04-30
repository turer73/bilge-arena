/**
 * Bilge Arena Oda: HostGameActions smoke test
 * Sprint 1 PR4e-3
 *
 * 1 senaryo: isHost + state=active -> "Cevabi Goster" buton; state=reveal
 * -> "Sonraki Tura Geç" buton. isHost=false -> null.
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

const formAction = vi.fn()

describe('HostGameActions', () => {
  test('1) isHost=false -> null', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    const { container } = render(
      <HostGameActions isHost={false} roomId="r1" roomState="active" />,
    )
    expect(container.firstChild).toBeNull()
  })

  test('2) isHost=true + state=active -> "Cevabı Göster" buton', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    render(<HostGameActions isHost={true} roomId="r1" roomState="active" />)
    expect(
      screen.getByRole('button', { name: /Cevabı Göster/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Sonraki Tura/i }),
    ).not.toBeInTheDocument()
  })

  test('3) isHost=true + state=reveal -> "Sonraki Tura Geç" buton', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    render(<HostGameActions isHost={true} roomId="r1" roomState="reveal" />)
    expect(
      screen.getByRole('button', { name: /Sonraki Tura/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Cevabı Göster/i }),
    ).not.toBeInTheDocument()
  })

  test('4) isHost=true + state=lobby -> null (sadece active/reveal)', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    const { container } = render(
      <HostGameActions isHost={true} roomId="r1" roomState="lobby" />,
    )
    expect(container.firstChild).toBeNull()
  })
})
