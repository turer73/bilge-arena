/**
 * Bilge Arena Oda: HostActions component test
 * Sprint 1 PR4c Task 4
 *
 * 2 senaryo:
 *   1) isHost=false -> null render (host degil, panel gizli)
 *   2) isHost=true + state=lobby -> 2 button (Start + Cancel) gorunur
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
  startRoomAction: vi.fn(),
  cancelRoomAction: vi.fn(),
}))

import { HostActions } from '../HostActions'

const formAction = vi.fn()

describe('HostActions', () => {
  test('1) isHost=false -> null render', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    const { container } = render(
      <HostActions isHost={false} roomId="r1" roomState="lobby" />,
    )
    expect(container.firstChild).toBeNull()
  })

  test('2) isHost=true + state=lobby -> 2 button (Start + Cancel) gorunur', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    render(<HostActions isHost={true} roomId="r1" roomState="lobby" />)
    expect(
      screen.getByRole('button', { name: /Oyunu Başlat/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Odayı İptal Et/i }),
    ).toBeInTheDocument()
  })
})
