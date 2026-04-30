import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RoomCard } from '../RoomCard'
import type { RoomListItem } from '@/lib/rooms/server-fetch'

const room: RoomListItem = {
  id: '1',
  code: 'BIL2GE',
  title: 'Test Odasi',
  state: 'lobby',
  created_at: '2026-04-29',
  room_members: [{ count: 4 }],
}

describe('RoomCard', () => {
  test('1) Link href = /oda/${code}', () => {
    render(<RoomCard room={room} />)
    expect(screen.getByRole('link').getAttribute('href')).toBe('/oda/BIL2GE')
  })

  test('2) title + code + count render', () => {
    render(<RoomCard room={room} />)
    expect(screen.getByText('Test Odasi')).toBeInTheDocument()
    expect(screen.getByText('BIL2GE')).toBeInTheDocument()
    expect(screen.getByText('4 oyuncu')).toBeInTheDocument()
  })

  test('3) StateBadge with room.state', () => {
    render(<RoomCard room={room} />)
    expect(screen.getByText('Bekliyor')).toBeInTheDocument()
  })
})
