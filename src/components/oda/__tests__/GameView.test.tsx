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
  answers_count: 3,
  my_answer: null,
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

  test('1) active + question + 4 options -> render select-then-submit form', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    const { container } = render(<GameView state={baseState} userId="u1" />)

    expect(mockUseActionState).toHaveBeenCalledWith(mockSubmitAnswerAction, {})
    expect(screen.getByText(/Türkiye’nin başkenti/)).toBeInTheDocument()

    // PR4f: 4 option butonu type=button (toggle selection), aria-pressed
    const optionButtons = container.querySelectorAll(
      'button[type="button"][aria-pressed]',
    ) as NodeListOf<HTMLButtonElement>
    expect(optionButtons).toHaveLength(4)

    // 1 submit butonu ("Önce Bir Seçenek Seç" disabled)
    expect(
      screen.getByRole('button', { name: /Önce Bir Seçenek Seç/i }),
    ).toBeDisabled()

    // Hidden room_id + answer_value
    const roomIdInput = container.querySelector(
      'input[name="room_id"]',
    ) as HTMLInputElement | null
    expect(roomIdInput?.value).toBe('r1')
    const answerInput = container.querySelector(
      'input[name="answer_value"]',
    ) as HTMLInputElement | null
    expect(answerInput?.value).toBe('') // henuz secim yok

    // Soru badge + countdown
    expect(screen.getByText('Soru 2 / 10')).toBeInTheDocument()
    expect(
      screen.getByLabelText(/Cevap veren oyuncu sayısı/i),
    ).toHaveTextContent('3')

    // Skor
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  test('2) PR4f: my_answer dolu -> "Cevabın Gönderildi" lock UI + indicator', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    const stateWithAnswer: RoomState = {
      ...baseState,
      my_answer: {
        answer_value: 'Ankara',
        is_correct: null,
        points_awarded: 0,
        response_ms: 8500,
      },
    }
    render(<GameView state={stateWithAnswer} userId="u1" />)

    // Submit button "Cevabın Gönderildi" + disabled
    expect(
      screen.getByRole('button', { name: /Cevabın Gönderildi/i }),
    ).toBeDisabled()

    // Indicator "Cevabın: Ankara" — strong tagi icin 1 match
    expect(screen.getByText(/Cevabın:/)).toBeInTheDocument()
    const strongAnkara = screen.getByText('Ankara', { selector: 'strong' })
    expect(strongAnkara).toBeInTheDocument()
  })
})
