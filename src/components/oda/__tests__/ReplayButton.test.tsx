/**
 * Bilge Arena Oda: ReplayButton component tests
 * Sprint 2C Task 8 (Replay & Share)
 */

import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const { mockUseActionState } = vi.hoisted(() => ({
  mockUseActionState: vi.fn(),
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return { ...actual, useActionState: mockUseActionState }
})

vi.mock('@/lib/rooms/actions', () => ({
  replayRoomAction: vi.fn(),
}))

import { ReplayButton } from '../ReplayButton'

const formAction = vi.fn()

describe('ReplayButton', () => {
  test('1) Initial render: "Tekrar Oyna" buton + hidden source_room_id', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    const { container } = render(<ReplayButton sourceRoomId="r1-uuid" />)
    expect(
      screen.getByRole('button', { name: /Tekrar Oyna/i }),
    ).toBeInTheDocument()
    const hidden = container.querySelector(
      'input[name="source_room_id"]',
    ) as HTMLInputElement
    expect(hidden).not.toBeNull()
    expect(hidden.value).toBe('r1-uuid')
  })

  test('2) isPending=true -> "Oluşturuluyor…" + disabled', () => {
    mockUseActionState.mockReturnValue([{}, formAction, true])
    render(<ReplayButton sourceRoomId="r1-uuid" />)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(btn.textContent).toMatch(/Oluşturuluyor/i)
  })

  test('3) error state -> role=alert', () => {
    mockUseActionState.mockReturnValue([
      { error: 'Sadece odaya katilmis kullanicilar' },
      formAction,
      false,
    ])
    render(<ReplayButton sourceRoomId="r1-uuid" />)
    expect(screen.getByRole('alert')).toHaveTextContent(
      /odaya katilmis kullanicilar/i,
    )
  })
})
