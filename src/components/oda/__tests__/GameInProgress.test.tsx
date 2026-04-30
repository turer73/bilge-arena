/**
 * Bilge Arena Oda: GameInProgress smoke test
 * Sprint 1 PR4e-1
 */

import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GameInProgress } from '../GameInProgress'
import type { RoomState } from '@/lib/rooms/room-state-reducer'

const baseState = (overrides: Partial<RoomState['room']> = {}): RoomState => ({
  room: {
    id: 'r1',
    code: 'BLZGE2',
    title: 'Test Oyun',
    state: 'active',
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
      score: 42,
    },
  ],
  current_round: {
    round_number: 3,
    question_id: 'q1',
    started_at: '2026-04-30T00:00:00Z',
    deadline: '2026-04-30T00:00:20Z',
    revealed_at: null,
  },
  answers_count: 0,
  scoreboard: [],
  online: new Set<string>(),
  isStale: false,
})

describe('GameInProgress', () => {
  test('1) state=active -> "Soru 3 / 10" + skor gosterilir', () => {
    render(<GameInProgress state={baseState()} userId="u1" />)
    expect(screen.getByText('Test Oyun')).toBeInTheDocument()
    expect(screen.getByText(/Soru 3 \/ 10/)).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  test('2) state=reveal -> "Sonuç" badge + reveal mesaji', () => {
    render(<GameInProgress state={baseState({ state: 'reveal' })} userId="u1" />)
    expect(screen.getByText(/Sonuç 3 \/ 10/)).toBeInTheDocument()
    expect(screen.getByText(/Cevap gösterimi/)).toBeInTheDocument()
  })
})
