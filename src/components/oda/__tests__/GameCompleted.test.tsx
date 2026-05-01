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
  my_answer: null,
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

  test('3) PR4g: scoreboard ile medal UI (top 3 emoji + correct_count + tie-breaker)', () => {
    const stateWithBoard: RoomState = {
      ...completedState(),
      scoreboard: [
        {
          user_id: 'u-host',
          display_name: 'Veli',
          score: 80,
          correct_count: 8,
          response_ms_total: 65000,
        },
        {
          user_id: 'u1',
          display_name: 'Ali',
          score: 50,
          correct_count: 5,
          response_ms_total: 90000,
        },
        {
          user_id: 'u2',
          display_name: 'Ayşe',
          score: 50,
          correct_count: 5,
          response_ms_total: 100000,
        },
        {
          user_id: 'u3',
          display_name: 'Can',
          score: 20,
          correct_count: 2,
          response_ms_total: 30000,
        },
      ],
    }
    render(<GameCompleted state={stateWithBoard} userId="u1" />)

    // Top 3 medal emoji
    expect(screen.getByText('🥇')).toBeInTheDocument()
    expect(screen.getByText('🥈')).toBeInTheDocument()
    expect(screen.getByText('🥉')).toBeInTheDocument()

    // 4. sira numara gozukur
    expect(screen.getByText('4')).toBeInTheDocument()

    // correct_count detay (Veli 8, Ali+Ayşe 5 herkesin)
    expect(screen.getByText(/8 doğru/)).toBeInTheDocument()
    expect(screen.getAllByText(/5 doğru/)).toHaveLength(2)
  })
})
