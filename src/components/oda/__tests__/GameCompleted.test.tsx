/**
 * Bilge Arena Oda: GameCompleted smoke test
 * Sprint 1 PR4e-1
 */

import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GameCompleted } from '../GameCompleted'
import type { RoomState } from '@/lib/rooms/room-state-reducer'

const completedState = (
  overrides: Partial<RoomState['room']> = {},
): RoomState => ({
  room: {
    id: 'r1',
    code: 'BLZGE2',
    title: 'Test Bitti',
    state: 'completed',
    mode: 'sync',
    host_id: 'h1',
    category: 'genel-kultur',
    difficulty: 2,
    question_count: 10,
    max_players: 8,
    per_question_seconds: 20,
    created_at: '2026-04-30',
    ...overrides,
  },
  members: [
    {
      user_id: 'u1',
      display_name: 'Ali',
      joined_at: '2026-04-30T00:00:00Z',
      is_host: false,
      is_kicked: false,
      score: 30,
    },
    {
      user_id: 'u2',
      display_name: 'Ayşe',
      joined_at: '2026-04-30T00:00:01Z',
      is_host: true,
      is_kicked: false,
      score: 50,
    },
  ],
  current_round: null,
  answers_count: 0,
  scoreboard: [],
  online: new Set<string>(),
  isStale: false,
})

describe('GameCompleted', () => {
  test('1) state=completed -> skora gore desc siralama + (sen) marker', () => {
    render(<GameCompleted state={completedState()} userId="u1" />)
    // 1. sira: Ayşe (50) - host
    // 2. sira: Ali (30) - me
    expect(screen.getByText('Ayşe')).toBeInTheDocument()
    expect(screen.getByText('Ali')).toBeInTheDocument()
    expect(screen.getByText(/\(sen\)/)).toBeInTheDocument()

    // Yeni oda + odalarım linkleri
    expect(screen.getByRole('link', { name: /Yeni Oda Kur/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Odalarım/i })).toBeInTheDocument()
  })

  test('2) state=archived -> arşiv mesaji gosterilir', () => {
    render(
      <GameCompleted state={completedState({ state: 'archived' })} userId="u1" />,
    )
    expect(screen.getByText(/arşivlendi.*30/i)).toBeInTheDocument()
  })
})
