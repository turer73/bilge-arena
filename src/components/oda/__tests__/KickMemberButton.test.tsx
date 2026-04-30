/**
 * Bilge Arena Oda: KickMemberButton component test
 * Sprint 1 PR4d
 *
 * 1 senaryo:
 *   1) form structure: hidden room_id + hidden target_user_id + submit button
 *      "Cikar" label + useActionState kickMemberAction'la cagrilir
 */

import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const { mockUseActionState, mockKickMemberAction } = vi.hoisted(() => ({
  mockUseActionState: vi.fn(),
  mockKickMemberAction: vi.fn(),
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return { ...actual, useActionState: mockUseActionState }
})

vi.mock('@/lib/rooms/actions', () => ({
  kickMemberAction: mockKickMemberAction,
}))

import { KickMemberButton } from '../KickMemberButton'

const formAction = vi.fn()

describe('KickMemberButton', () => {
  test('1) form structure + useActionState kickMemberAction\'la cagrildi', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    const { container } = render(
      <KickMemberButton
        roomId="11111111-1111-4111-8111-111111111111"
        targetUserId="22222222-2222-4222-8222-222222222222"
        targetName="Ali"
      />,
    )

    // useActionState kickMemberAction ile cagrilmis
    expect(mockUseActionState).toHaveBeenCalledWith(mockKickMemberAction, {})

    // 2 hidden input dogru deger
    const roomIdInput = container.querySelector(
      'input[name="room_id"]',
    ) as HTMLInputElement | null
    const targetIdInput = container.querySelector(
      'input[name="target_user_id"]',
    ) as HTMLInputElement | null
    expect(roomIdInput?.value).toBe('11111111-1111-4111-8111-111111111111')
    expect(targetIdInput?.value).toBe('22222222-2222-4222-8222-222222222222')

    // Cikar button + ARIA hedef adi
    expect(
      screen.getByRole('button', { name: /Ali adli üyeyi çıkar/i }),
    ).toBeInTheDocument()
  })
})
