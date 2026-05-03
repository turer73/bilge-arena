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
  typing_users: new Set<string>(),
  isStale: false,
}

describe('GameView', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date('2026-04-30T00:00:00Z') })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test('1) active + question + 4 options -> tek-tik UX (Onayla butonu yok)', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    const { container } = render(<GameView state={baseState} userId="u1" />)

    expect(mockUseActionState).toHaveBeenCalledWith(mockSubmitAnswerAction, {})
    expect(screen.getByText(/Türkiye’nin başkenti/)).toBeInTheDocument()

    // 4 option butonu type=button + aria-pressed; tikladiginda direkt submit
    const optionButtons = container.querySelectorAll(
      'button[type="button"][aria-pressed]',
    ) as NodeListOf<HTMLButtonElement>
    expect(optionButtons).toHaveLength(4)

    // 2026-05-03: tek-tik UX — "Onayla ve Gönder" butonu yok, type=submit
    // butonu da yok (form artik onClick handler ile submit ediliyor)
    expect(
      screen.queryByRole('button', { name: /Onayla ve Gönder/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Önce Bir Seçenek Seç/i }),
    ).not.toBeInTheDocument()

    // Hidden room_id + answer_value
    const roomIdInput = container.querySelector(
      'input[name="room_id"]',
    ) as HTMLInputElement | null
    expect(roomIdInput?.value).toBe('r1')

    // Soru badge + countdown
    expect(screen.getByText('Soru 2 / 10')).toBeInTheDocument()
    expect(
      screen.getByLabelText(/Cevap veren oyuncu sayısı/i),
    ).toHaveTextContent('3')

    // Skor
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  test('3) Codex P1 PR#56 fix: round_id degisirse stale localSelection sifirlanir (highlight kaybolur)', () => {
    mockUseActionState.mockReturnValue([{}, formAction, false])
    const { rerender, container } = render(<GameView state={baseState} userId="u1" />)
    // hidden input bos baslangicta (selection yok)
    let answerInput = container.querySelector(
      'input[name="answer_value"]',
    ) as HTMLInputElement
    expect(answerInput.value).toBe('')

    // Yeni round_id ile re-render — eski selection yok, hidden bos
    const nextRound: RoomState = {
      ...baseState,
      current_round: {
        ...baseState.current_round!,
        round_id: 'new-round-id',
        round_index: 3,
      },
    }
    rerender(<GameView state={nextRound} userId="u1" />)
    answerInput = container.querySelector(
      'input[name="answer_value"]',
    ) as HTMLInputElement
    expect(answerInput.value).toBe('')
  })

  test('2) PR4f: my_answer dolu -> "Cevabın Gönderildi" status banner + indicator', () => {
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

    // 2026-05-03: tek-tik UX — submit button yok, "Cevabın Gönderildi" banner
    expect(screen.getByText(/✓ Cevabın Gönderildi/i)).toBeInTheDocument()

    // Indicator "Cevabın: Ankara" — strong tagi icin 1 match
    expect(screen.getByText(/Cevabın:/)).toBeInTheDocument()
    const strongAnkara = screen.getByText('Ankara', { selector: 'strong' })
    expect(strongAnkara).toBeInTheDocument()
  })
})
