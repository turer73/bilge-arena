/**
 * Bilge Arena Oda: MemberActions component test
 * Sprint 1 PR4b Task 6
 *
 * 1 senaryo:
 *   24) leave form structure -> hidden room_id + submit btn calls leaveRoomAction
 *
 * Server Action (formAction) jsdom'da yurutulemez. Test: form'un dogru
 * yapida oldugunu (hidden input + submit) ve leaveRoomAction'in
 * useActionState'e gectiğini dogruluyor.
 */

import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const { mockUseActionState, mockLeaveRoomAction } = vi.hoisted(() => ({
  mockUseActionState: vi.fn(),
  mockLeaveRoomAction: vi.fn(),
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return { ...actual, useActionState: mockUseActionState }
})

vi.mock('@/lib/rooms/actions', () => ({
  leaveRoomAction: mockLeaveRoomAction,
}))

import { MemberActions } from '../MemberActions'

const formAction = vi.fn()

describe('MemberActions', () => {
  test('24) leave button form: hidden room_id + leaveRoomAction useActionState\'e gecirildi', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    const { container } = render(
      <MemberActions roomId="r1" roomCode="BLZGE2" roomState="lobby" />,
    )

    // useActionState leaveRoomAction ile cagrilmis
    expect(mockUseActionState).toHaveBeenCalledWith(mockLeaveRoomAction, {})

    // hidden room_id input dogru deger
    const hiddenInput = container.querySelector(
      'input[name="room_id"]',
    ) as HTMLInputElement | null
    expect(hiddenInput).not.toBeNull()
    expect(hiddenInput?.value).toBe('r1')

    // submit button "Odadan Ayril" label
    expect(
      screen.getByRole('button', { name: /Odadan Ayril/i }),
    ).toBeInTheDocument()
  })
})
