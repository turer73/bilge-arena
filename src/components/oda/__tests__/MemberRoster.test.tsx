/**
 * Bilge Arena Oda: MemberRoster component tests
 * Sprint 1 PR4b Task 6
 *
 * 2 senaryo:
 *   21) presence dot - online member yesil indicator (aria-label="online")
 *   22) host badge - is_host=true icin "Host" rozet
 */

import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemberRoster } from '../MemberRoster'
import type { Member } from '@/lib/rooms/room-state-reducer'

const member = (overrides: Partial<Member> = {}): Member => ({
  user_id: 'u1',
  display_name: 'A',
  joined_at: '2026-04-30T00:00:00Z',
  is_host: false,
  is_kicked: false,
  ...overrides,
})

describe('MemberRoster', () => {
  test('21) presence dot - online member yesil indicator', () => {
    render(
      <MemberRoster
        members={[member({ user_id: 'u1', display_name: 'A' })]}
        online={new Set(['u1'])}
        hostId="u-host"
        maxPlayers={8}
      />,
    )
    expect(screen.getByLabelText(/^online$/i)).toBeInTheDocument()
  })

  test('22) host badge - is_host=true icin "Host" rozet', () => {
    render(
      <MemberRoster
        members={[
          member({ user_id: 'h1', display_name: 'Ali', is_host: true }),
        ]}
        online={new Set()}
        hostId="h1"
        maxPlayers={8}
      />,
    )
    // Display name "Ali", rozet text "Host" (duplicate match olmamali)
    expect(screen.getByText('Host')).toBeInTheDocument()
    expect(screen.getByText('Ali')).toBeInTheDocument()
  })
})
