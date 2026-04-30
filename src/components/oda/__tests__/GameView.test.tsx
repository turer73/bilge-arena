/**
 * Bilge Arena Oda: GameView smoke test
 * Sprint 1 PR4e-2
 *
 * 1 senaryo:
 *   1) state.active + question_text + options -> 4 buton + countdown + form
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { mockUseActionState, mockSubmitAnswerAction } = vi.hoisted(() => ({
  mockUseActionState: vi.fn(),
  mockSubmitAnswerAction: vi.fn(),
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return { ...actual, useActionState: mockUseActionState }
})

vi.mock('@/lib/rooms/actions', () => ({
  submitAnswerAction: mockSubmitAnswerAction,
}))

import { GameView } from '../GameView'
import type { RoomState } from '@/lib/rooms/room-state-reducer'

const formAction = vi.fn()

const baseState: RoomState = {
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
  },
  members: [
    {
      user_id: 'u1',
      display_name: 'Ali',
      joined_at: '2026-04-30T00:00:00Z',
      is_host: false,
      is_kicked: false,
      score: 12,
    },
  ],
  current_round: {
    round_index: 2,
    question_id: 'q1',
    started_at: '2026-04-30T00:00:00Z',
    ends_at: '2026-12-31T23:59:59Z', // far future, won't expire in test
    revealed_at: null,
    question_text: 'Türkiye’nin başkenti neresidir?',
    options: ['İstanbul', 'Ankara', 'İzmir', 'Bursa'],
  },
  answers_count: 0,
  scoreboard: [],
  online: new Set<string>(),
  isStale: false,
}

describe('GameView', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-04-30T00:00:00Z') })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test('1) active + question + 4 options -> render form + buttons + skor', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    const { container } = render(<GameView state={baseState} userId="u1" />)

    expect(mockUseActionState).toHaveBeenCalledWith(mockSubmitAnswerAction, {})
    expect(screen.getByText(/Türkiye’nin başkenti/)).toBeInTheDocument()

    // 4 secenek butonu (her biri name="answer_value" + value=opt)
    const buttons = container.querySelectorAll(
      'button[name="answer_value"]',
    ) as NodeListOf<HTMLButtonElement>
    expect(buttons).toHaveLength(4)
    expect(buttons[0].value).toBe('İstanbul')
    expect(buttons[1].value).toBe('Ankara')

    // Hidden room_id
    const roomIdInput = container.querySelector(
      'input[name="room_id"]',
    ) as HTMLInputElement | null
    expect(roomIdInput?.value).toBe('r1')

    // Soru badge + countdown
    expect(screen.getByText('Soru 2 / 10')).toBeInTheDocument()

    // Skor
    expect(screen.getByText('12')).toBeInTheDocument()
  })
})
